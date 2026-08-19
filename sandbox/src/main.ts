/**
 * Einstiegspunkt der Sandbox.
 *
 * Trägt den gesamten Prüfvorgang aus Abbildung 7.1:
 *
 *   1 Checkout        Repository klonen, Diff als Patch-Datei ablegen, Rauschen filtern
 *   2 Regelbasis      docs/adr/ im Projekt, sonst Rückfall auf den Gruppenstandard
 *   3 Regelextraktion jedes ADR wird in für den MR relevante Regeln zerlegt
 *   4 Vorfilter       Regeln ohne Bezug zu einer geänderten Datei fallen heraus
 *
 * Für die Relevanz in Schritt 3 und 4 zählen nur die geänderten Dateien, die
 * nicht selbst zur Regelbasis gehören; siehe `relevantFiles` in `main`.
 *   5 Prüfung        je Regel: Locator sucht, Reader liest und urteilt
 *   6 Befunde         je Regel ein Urteil mit Begründung und Belegstelle
 *
 * Danach schickt das Skript die Antworten gebündelt per HTTP-Callback an das
 * Backend. Der Container wird anschließend beendet und gelöscht, sodass der
 * geklonte Quellcode ab diesem Zeitpunkt nirgends mehr existiert
 * (Abschnitt 7.2.5).
 *
 * Die Prüfvorgänge laufen mit begrenzter Parallelität. Die einzelnen Regeln
 * bleiben isoliert und budgetiert, aber unabhängige LLM-Wartezeiten blockieren
 * einander nicht.
 */

import { config } from "./config.js";
import { checkout } from "./checkout.js";
import { mapWithConcurrency } from "./concurrency.js";
import { extractRules } from "./extract.js";
import { judgeRule } from "./judge.js";
import { loadRuleBase } from "./rulebase.js";
import { setExcludedAdrPaths } from "./tools.js";
import { counters, log } from "./trace.js";
import { triage } from "./triage.js";
import type { AgentFailure, Finding, SandboxResult } from "./types.js";

async function sendCallback(result: SandboxResult): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
    }
    try {
      const response = await fetch(config.callbackUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.callbackToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(result),
        signal: AbortSignal.timeout(120_000),
      });
      if (response.ok) {
        log.info("callback_sent", { status: response.status });
        return;
      }
      log.warn("callback_rejected", {
        status: response.status,
        body: (await response.text()).slice(0, 500),
      });
    } catch (error) {
      log.warn("callback_failed", { attempt, error: String(error) });
    }
  }
  throw new Error("Callback an das Backend endgültig fehlgeschlagen.");
}

async function main(): Promise<void> {
  const startedAt = new Date();
  log.info("run_start", {
    reviewId: config.reviewId,
    model: config.llmModel,
    budget: config.budget,
    concurrency: config.concurrency,
  });

  // 1 Checkout
  const { changedFiles, filteredFiles } = await checkout();

  // 2 Regelbasis
  const ruleBase = await loadRuleBase();
  // Die ADR-Dateien selbst sind vom Suchraum ausgenommen, damit sich die zu
  // prüfende Regel nicht als eigener Beleg wiederfindet (FA-5).
  setExcludedAdrPaths(ruleBase.excludedPaths);

  const failures: AgentFailure[] = [];

  // Die ADR-Dokumente sind die Regelbasis, nicht der Prüfgegenstand. Bringt ein
  // Merge Request Regeln und Code zugleich ein, liegen sie mit im
  // Änderungssatz - und dann lässt sich jede Regel über den Pfad ihres eigenen
  // Dokuments für einschlägig halten. Extraktion und Vorfilter entscheiden auf
  // dieser Grundlage mal so und mal so; gemessen schwankte allein daraus die
  // Zahl der geprüften Regeln um mehr als das Doppelte. Für die Relevanz zählen
  // deshalb nur die übrigen Pfade. Gemeldet wird weiterhin der vollständige
  // Änderungssatz, und als Beleg sind die ADRs ohnehin ausgeschlossen (FA-5).
  const excludedAdrPaths = new Set(ruleBase.excludedPaths);
  const subjectFiles = changedFiles.filter((p) => !excludedAdrPaths.has(p));
  // Ändert ein Merge Request ausschließlich ADRs, bliebe sonst kein Signal
  // übrig; dann gilt wie bisher der gesamte Änderungssatz.
  const relevantFiles = subjectFiles.length > 0 ? subjectFiles : changedFiles;
  log.info("relevance_scope", {
    changedFiles: changedFiles.length,
    adrFilesInDiff: changedFiles.length - subjectFiles.length,
    relevantFiles: relevantFiles.length,
  });

  // 3 Regelextraktion
  const extraction = await extractRules(ruleBase.documents, relevantFiles);
  failures.push(...extraction.failures);
  log.info("extraction_done", {
    documents: ruleBase.documents.length,
    rules: extraction.rules.length,
    failures: extraction.failures.length,
  });

  // 4 Vorfilter
  const triaged = await triage(extraction.rules, relevantFiles);
  failures.push(...triaged.failures);

  // 5 Prüfung je Regel
  const judged = await mapWithConcurrency(
    triaged.selected,
    config.concurrency.judging,
    async (rule, index) => {
      log.info("rule_start", {
        index: index + 1,
        of: triaged.selected.length,
        ruleId: rule.id,
      });
      return judgeRule(rule, changedFiles);
    },
  );
  const findings: Finding[] = judged.map((outcome) => outcome.finding);
  failures.push(...judged.flatMap((outcome) => outcome.failures));

  const finishedAt = new Date();

  // 6 Befunde bündeln und zurückmelden
  const result: SandboxResult = {
    reviewId: config.reviewId,
    ruleOrigin: ruleBase.origin,
    adrFiles: ruleBase.documents.map((doc) => doc.file),
    changedFiles,
    rules: extraction.rules,
    droppedRules: triaged.dropped,
    findings,
    failures,
    adrTokenUsage: extraction.adrTokenUsage,
    stats: {
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      modelCalls: counters.modelCalls,
      toolCalls: counters.toolCalls,
      promptTokens: counters.promptTokens,
      completionTokens: counters.completionTokens,
      totalTokens: counters.totalTokens,
      averageTokensPerCheckedRule:
        findings.length > 0 ? counters.totalTokens / findings.length : 0,
      averageTokensPerAdr:
        ruleBase.documents.length > 0 ? counters.totalTokens / ruleBase.documents.length : 0,
    },
  };

  log.info("run_summary", {
    changedFiles: changedFiles.length,
    relevantFiles: relevantFiles.length,
    filteredFiles: filteredFiles.length,
    rules: extraction.rules.length,
    checked: findings.length,
    nc: findings.filter((f) => f.verdict === "NC").length,
    cia: findings.filter((f) => f.verdict === "CIA").length,
    c: findings.filter((f) => f.verdict === "C").length,
    failures: failures.length,
    modelCalls: counters.modelCalls,
    toolCalls: counters.toolCalls,
    promptTokens: counters.promptTokens,
    completionTokens: counters.completionTokens,
    totalTokens: counters.totalTokens,
    durationMs: result.stats.durationMs,
  });

  await sendCallback(result);
}

main().catch((error) => {
  log.error("run_failed", { error: String(error), stack: (error as Error).stack });
  process.exitCode = 1;
});
