/**
 * Einstiegspunkt der Sandbox.
 *
 * Trägt den gesamten Prüfvorgang aus Abbildung 7.1:
 *
 *   1 Checkout        Repository klonen, Diff als Patch-Datei ablegen, Rauschen filtern
 *   2 Modus           Projekt-ADRs plus Gruppenstandards, andernfalls Lernmodus
 *   3 Regelextraktion Architekturregeln werden in prüfbare Einzelregeln zerlegt
 *   4 Vorfilter       irrelevante Architekturregeln fallen heraus
 *
 * ADR-Dateien dienen ausschließlich als Regelbasis. Sie werden aus dem
 * Änderungssatz entfernt und nie als Prüfgegenstand oder Patch-Kontext genutzt.
 *   5 Prüfung        Diffteile durchsuchen, Schnittstellen prüfen, Kandidaten verifizieren
 *   6 Befunde         bestätigte Ursachen deduplizieren und Ergebnisse bündeln
 *
 * Danach schickt das Skript die Antworten gebündelt per HTTP-Callback an das
 * Backend. Der Container wird anschließend beendet und gelöscht, sodass der
 * geklonte Quellcode ab diesem Zeitpunkt nirgends mehr existiert
 * (Abschnitt 7.2.5).
 *
 * Die Prüfvorgänge laufen mit begrenzter Parallelität. Jede Such- und
 * Verifikationsaufgabe erhält einen isolierten, budgetierten Modellkontext.
 */

import { config } from "./config.js";
import { sendCallback } from "./callback.js";
import { buildStats } from "./stats.js";
import { checkout } from "./checkout.js";
import { extractRules } from "./extract.js";
import { reviewArchitecture } from "./architecture.js";
import { reviewForLearning } from "./learning.js";
import { loadRuleBase } from "./rulebase.js";
import { setExcludedAdrPaths, setBaseSha } from "./tools.js";
import { counters, log } from "./trace.js";
import type { AgentFailure, Finding, SandboxResult } from "./types.js";

async function main(): Promise<void> {
  const startedAt = new Date();
  log.info("run_start", {
    reviewId: config.reviewId,
    model: config.llmModel,
    budget: config.budget,
    learningBudget: config.learningBudget,
    concurrency: config.concurrency,
  });

  // 1 Checkout
  const checkoutStartedAt = performance.now();
  const { changedFiles, filteredFiles, excludedAdrFiles, baseSha } = await checkout();
  setBaseSha(baseSha);
  const checkoutMs = Math.round(performance.now() - checkoutStartedAt);

  // 2 Regelbasis
  const rulebaseStartedAt = performance.now();
  const ruleBase = await loadRuleBase();
  const rulebaseMs = Math.round(performance.now() - rulebaseStartedAt);
  // ADR-Dateien sind Regelbasis, aber kein Prüfgegenstand oder Beleg.
  setExcludedAdrPaths(ruleBase.excludedPaths);

  const failures: AgentFailure[] = [];

  // ADR-Änderungen sind bereits beim Checkout ausgeschlossen. Ohne andere
  // prüfrelevante Änderungen gibt es für diesen Lauf nichts zu beurteilen.
  const relevantFiles = changedFiles;
  log.info("relevance_scope", {
    reviewableFiles: changedFiles.length,
    adrFilesExcluded: excludedAdrFiles.length,
    relevantFiles: relevantFiles.length,
  });

  if (ruleBase.mode === "learning") {
    const analysisStartedAt = performance.now();
    const learning = relevantFiles.length > 0
      ? await reviewForLearning()
      : { findings: [], failures: [], metrics: undefined };
    const analysisMs = Math.round(performance.now() - analysisStartedAt);
    failures.push(...learning.failures);
    const result: SandboxResult = {
      reviewId: config.reviewId,
      mode: "learning",
      ruleOrigin: "learning",
      adrFiles: [],
      changedFiles,
      rules: [],
      droppedRules: [],
      findings: learning.findings,
      failures,
      stats: {
        ...buildStats(startedAt, learning.findings.length, { checkoutMs, rulebaseMs, analysisMs }),
        learning: learning.metrics,
        models: { default: config.learningModels.search, fast: config.learningModels.deduplicate, verify: config.learningModels.verify },
      },
    };
    log.info("run_summary", {
      mode: "learning",
      changedFiles: changedFiles.length,
      findings: learning.findings.length,
      failures: failures.length,
      durationMs: result.stats.durationMs,
      phases: result.stats.phases,
    });
    await sendCallback(result);
    return;
  }

  // 3 Regelextraktion; bei ADR-only-/Noise-only-MRs wird kein Review
  // gestartet und daher auch keine Regel-Extraktion benötigt.
  const extractionStartedAt = performance.now();
  const extraction =
    relevantFiles.length > 0
      ? await extractRules(ruleBase.documents)
      : { rules: [], failures: [], adrTokenUsage: [] };
  const extractionMs = Math.round(performance.now() - extractionStartedAt);
  failures.push(...extraction.failures);
  log.info("extraction_done", {
    documents: ruleBase.documents.length,
    rules: extraction.rules.length,
    failures: extraction.failures.length,
  });

  // 4/5 Diffbasierte Zuordnung, gemeinsame Suche und unabhängige Verifikation.
  const judgingStartedAt = performance.now();
  const architecture = relevantFiles.length > 0
    ? await reviewArchitecture(extraction.rules, config.learningExplanation)
    : { findings: [] as Finding[], dropped: [], failures: [], triageMs: 0, metrics: undefined };
  const findings = architecture.findings;
  failures.push(...architecture.failures);
  const triageMs = architecture.triageMs;
  const judgingMs = Math.max(0, Math.round(performance.now() - judgingStartedAt) - triageMs);

  // 6 Befunde bündeln und zurückmelden
  const result: SandboxResult = {
    reviewId: config.reviewId,
    mode: "architecture",
    ruleOrigin: ruleBase.origin,
    adrFiles: ruleBase.documents.map((doc) => doc.file),
    changedFiles,
    rules: extraction.rules,
    droppedRules: architecture.dropped,
    findings,
    failures,
    adrTokenUsage: extraction.adrTokenUsage,
    stats: { ...buildStats(
      startedAt,
      findings.length,
      { checkoutMs, rulebaseMs, extractionMs, triageMs, judgingMs },
      ruleBase.documents.length,
    ), architecture: architecture.metrics },
  };

  log.info("run_summary", {
    mode: "architecture",
    ruleOrigin: ruleBase.origin,
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
    phases: result.stats.phases,
  });

  await sendCallback(result);
}

main().catch((error) => {
  log.error("run_failed", { error: String(error), stack: (error as Error).stack });
  process.exitCode = 1;
});
