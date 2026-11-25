/** Gemeinsame Suche je Diffteil, unabhängige Prüfung der ADR-Verstöße. */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config.js";
import { mapWithConcurrency } from "./concurrency.js";
import { addedLinesByPath, candidateDiff, chunkReviewDiff, parseReviewDiff, type ReviewChunk, type ReviewFile } from "./review-diff.js";
import {
  evidenceSupportsCandidate, runReviewSession, verifiedEvidence,
  type ReadExcerpt, type ReviewSession,
} from "./review-session.js";
import { reviewChunkChanges } from "./review-changes.js";
import { modelText as text } from "./llm.js";
import { trackProgress } from "./progress.js";
import { loadEvidenceSnippet } from "./tools.js";
import { log } from "./trace.js";
import { triage } from "./triage.js";
import type { AgentFailure, Evidence, Finding, Rule, SandboxResult, TokenUsage, ToolCallTrace } from "./types.js";
import { ruleInput, batchRules } from "./rule-context.js";
import { DISCOVER, VERIFY, LEARNING_EXPLANATION, INTEGRATE, DEDUPLICATE } from "./architecture-prompts.js";

interface Candidate {
  rule: Rule;
  path: string;
  line: number;
  side?: "old";
  hypothesis: string;
  trace: ToolCallTrace[];
}

/** Suchabdeckung je Regel, auch wenn am Ende kein konkreter Verstoß bestätigt wird. */
interface RuleCoverage {
  incomplete: boolean;
  exhausted: boolean;
  searches: number;
  reads: number;
  rejected: number;
  missing: string[];
}

export function architectureCandidate(raw: unknown, rules: Rule[], chunk: ReviewChunk):
  Omit<Candidate, "trace"> | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const rule = rules.find((entry) => entry.id === item.rule_id);
  const path = text(item.path, 1000).replace(/^\.\//, "");
  const line = Number(item.line);
  if (item.side !== undefined && item.side !== "old") return null;
  const side = item.side as "old" | undefined;
  if (!rule || !Number.isInteger(line) || line < 1) return null;
  const changes = reviewChunkChanges(chunk);
  if (!(side === "old" ? changes.removed : changes.added).get(path)?.has(line) || !text(item.hypothesis)) return null;
  return { rule, path, line, ...(side ? { side } : {}), hypothesis: text(item.hypothesis) };
}

function integrationCandidate(raw: unknown, rules: Rule[], added: Map<string, Set<number>>, removed: Map<string, Set<number>>):
  Omit<Candidate, "trace"> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const item = raw as Record<string, unknown>;
  const rule = rules.find((entry) => entry.id === item.rule_id);
  const path = text(item.path, 1000).replace(/^\.\//, "");
  const line = item.line;
  const hypothesis = text(item.hypothesis);
  if (item.side !== undefined && item.side !== "old") return null;
  const side = item.side as "old" | undefined;
  if (!rule || typeof line !== "number" || !Number.isInteger(line) ||
    !(side === "old" ? removed : added).get(path)?.has(line) || !hypothesis) return null;
  return { rule, path, line, ...(side ? { side } : {}), hypothesis };
}

function overview(files: ReviewFile[]): string {
  const lines: string[] = [];
  let bytes = 0;
  for (const file of files) {
    const added = file.hunks.flatMap((hunk) => hunk.lines.filter((line) => line.kind === "+").map((line) => line.newLine));
    const card = JSON.stringify({ path: file.path, previous: file.oldPath,
      added: added.length, first: added[0], last: added.at(-1) });
    if (bytes + Buffer.byteLength(card) > 16_000) break;
    lines.push(card);
    bytes += Buffer.byteLength(card);
  }
  return `MR: ${files.length} Dateien. ${lines.length < files.length ? "Liste gekuerzt; kompletten Diff in mr_diff.patch suchen." : ""}\n${lines.join("\n")}`;
}

async function deduplicate(findings: Finding[], failures: AgentFailure[]): Promise<Finding[]> {
  const groups = new Map<string, Finding[]>();
  for (const finding of findings) groups.set(finding.rule.id, [...(groups.get(finding.rule.id) ?? []), finding]);
  const advance = trackProgress("architecture_deduplicate", groups.size);
  const results = await mapWithConcurrency([...groups.values()], config.concurrency.judging, async (group) => {
    const unique: Finding[] = [];
    const card = (item: Finding) => ({ id: item.id, anchor: item.anchor, rationale: item.rationale,
      consequence: item.consequence, suggestion: item.suggestion });
    for (let offset = 0; offset < group.length; offset += 8) {
      let incoming = group.slice(offset, offset + 8);
      for (let start = 0; start < Math.max(1, unique.length) && incoming.length; start += 8) {
        const existing = unique.slice(start, start + 8);
        if (existing.length + incoming.length < 2) continue;
        try {
          const session = await runReviewSession<Record<string, unknown>>(DEDUPLICATE,
            JSON.stringify({ existing: existing.map(card), incoming: incoming.map(card) }),
            { searchRounds: 0, fileReads: 0 }, { model: config.fastModel });
          const pairs = session.result.value.duplicates;
          if (!Array.isArray(pairs)) throw new Error("Dublettenentscheidung fehlt.");
          const order = [...existing, ...incoming].map((entry) => entry.id);
          const removed = new Set<string>();
          for (const pair of pairs) {
            if (!pair || !incoming.some((entry) => entry.id === pair.id) ||
              !order.includes(pair.duplicate_of) || order.indexOf(pair.duplicate_of) >= order.indexOf(pair.id) ||
              removed.has(pair.id)) throw new Error("Ungültige Dublettenreferenz.");
            removed.add(pair.id);
          }
          if (pairs.some((pair) => removed.has(pair.duplicate_of))) throw new Error("Verkettete Dublettenreferenz.");
          incoming = incoming.filter((entry) => !removed.has(entry.id));
        } catch (error) {
          failures.push({ stage: "reader", ruleId: group[0].rule.id, message: `Dublettenprüfung: ${(error as Error).message}` });
        }
      }
      unique.push(...incoming);
    }
    advance();
    return unique;
  });
  const retained = new Set(results.flat().map((finding) => finding.id));
  return findings.filter((finding) => retained.has(finding.id));
}

export function architectureVerification(value: Record<string, unknown>, candidate: Candidate,
  excerpts: ReadExcerpt[], learningExplanation = false):
  { rationale: string; consequence: string; suggestion: string; evidence: Evidence[] } | null {
  if (value.status !== "confirmed") return null;
  const evidence = verifiedEvidence(value.evidence, excerpts);
  const explanationLimit = learningExplanation ? 2400 : 1200;
  const rationale = text(value.rationale, explanationLimit);
  const consequence = text(value.consequence, explanationLimit);
  const suggestion = text(value.suggestion, explanationLimit);
  if (!evidence || !rationale || !consequence || !suggestion ||
    !evidenceSupportsCandidate(evidence, candidate, value.required_paths)) return null;
  return { evidence, rationale, consequence, suggestion };
}

export async function reviewArchitecture(rules: Rule[], learningExplanation = false): Promise<{
  findings: Finding[]; dropped: Awaited<ReturnType<typeof triage>>["dropped"]; failures: AgentFailure[]; triageMs: number;
  metrics: NonNullable<SandboxResult["stats"]["architecture"]>;
}> {
  const failures: AgentFailure[] = [];
  // 1. Änderungssatz vorbereiten und Regeln den einzelnen Diffteilen zuordnen.
  const patch = await readFile(join(config.repoDir, config.patchFile), "utf8");
  const files: ReviewFile[] = parseReviewDiff(patch);
  const added = addedLinesByPath(files);
  const removed = new Map(files.map((file) => [file.oldPath, new Set(file.hunks.flatMap((hunk) =>
    hunk.lines.filter((line) => line.kind === "-").map((line) => line.oldLine!)))]));
  const chunks = chunkReviewDiff(files, config.learningBudget.chunkBytes);
  const triageStartedAt = performance.now();
  const selected = await triage(rules, chunks);
  const triageMs = Math.round(performance.now() - triageStartedAt);
  failures.push(...selected.failures);
  const coverage = new Map<string, RuleCoverage>();
  for (const rule of selected.selected) coverage.set(rule.id, { incomplete: false, exhausted: false, searches: 0, reads: 0, rejected: 0, missing: [] });
  const recordCoverage = (batch: Rule[], session?: ReviewSession) => {
    for (const rule of batch) {
      const state = coverage.get(rule.id)!;
      state.incomplete ||= !session || session.result.budgetExhausted;
      state.exhausted ||= session?.result.budgetExhausted ?? false;
      state.searches += session?.result.trace.filter((entry) => entry.tool !== "read_file").length ?? 0;
      state.reads += session?.result.trace.filter((entry) => entry.tool === "read_file").length ?? 0;
    }
  };
  const searchBudget = (count: number) => ({ searchRounds: config.budget.searchRounds,
    fileReads: Math.max(config.budget.fileReads, Math.min(12, count + 2)) });
  // 2. Gemeinsame Suche: ein Repository-Kontext je Diffteil und Regelpaket.
  const searchStartedAt = performance.now();
  const jobs = chunks.flatMap((chunk) => batchRules(selected.byChunk.get(chunk.id) ?? []).map((batch) => ({ chunk, batch })));
  const advanceSearch = trackProgress("architecture_search", jobs.length);
  const discovered = await mapWithConcurrency(jobs, config.concurrency.judging, async ({ chunk, batch }) => {
    try {
      if (chunk.oversized) throw new Error("Diffzeile überschreitet das Teilbudget.");
      const session = await runReviewSession<Record<string, unknown>>(DISCOVER,
        `Regeln:\n${ruleInput(batch)}\n\nDiffteil:\n${chunk.diff}`,
        searchBudget(batch.length), { baseReads: true });
      recordCoverage(batch, session);
      if (!Array.isArray(session.result.value.candidates)) throw new Error("Kandidatenliste fehlt.");
      if (session.result.value.candidates.length > 30) recordCoverage(batch);
      return session.result.value.candidates.slice(0, 30).flatMap((raw) => {
        const candidate = architectureCandidate(raw, batch, chunk);
        if (!candidate) recordCoverage(batch);
        return candidate ? [{ ...candidate, trace: session.result.trace }] : [];
      });
    } catch (error) {
      recordCoverage(batch);
      failures.push({ stage: "locator", message: `${chunk.id}: ${(error as Error).message}` });
      return [] as Candidate[];
    } finally { advanceSearch(); }
  });
  const searchMs = Math.round(performance.now() - searchStartedAt);
  // 3. Verbindungen zwischen Diffteilen mit einer zusätzlichen Integrationssuche prüfen.
  const integrationStartedAt = performance.now();
  const integrationBatches = chunks.length > 1 ? batchRules(selected.selected) : [];
  const advanceIntegration = trackProgress("architecture_integration", integrationBatches.length);
  const integrated = await mapWithConcurrency(integrationBatches, config.concurrency.judging, async (batch) => {
    try {
      const session = await runReviewSession<Record<string, unknown>>(INTEGRATE,
        `Regeln:\n${ruleInput(batch)}\n` +
        `${overview(files)}\nBereits gefundene Kandidaten:\n${JSON.stringify(discovered.flat().filter((entry) => batch.includes(entry.rule)).map((entry) =>
          ({ rule_id: entry.rule.id, path: entry.path, line: entry.line, side: entry.side, hypothesis: entry.hypothesis })).slice(0, 50))}`,
        searchBudget(batch.length), { baseReads: true });
      recordCoverage(batch, session);
      if (!Array.isArray(session.result.value.candidates)) throw new Error("Integrationskandidaten fehlen.");
      if (session.result.value.candidates.length > 30) recordCoverage(batch);
      return session.result.value.candidates.slice(0, 30).flatMap((raw) => {
        const candidate = integrationCandidate(raw, batch, added, removed);
        if (!candidate) recordCoverage(batch);
        return candidate ? [{ ...candidate, trace: session.result.trace }] : [];
      });
    } catch (error) {
      recordCoverage(batch);
      failures.push({ stage: "locator", message: `Integration: ${(error as Error).message}` });
      return [] as Candidate[];
    } finally { advanceIntegration(); }
  });
  const integrationMs = Math.round(performance.now() - integrationStartedAt);
  // 4. Nur exakte Wiederholungen vorab entfernen; jede übrige Hypothese einzeln verifizieren.
  const verificationStartedAt = performance.now();
  const unique = new Map<string, Candidate>();
  for (const candidate of [...discovered.flat(), ...integrated.flat()]) {
    const key = JSON.stringify([candidate.rule.id, candidate.path, candidate.line, candidate.side, candidate.hypothesis.toLowerCase()]);
    if (!unique.has(key)) unique.set(key, candidate);
  }
  const candidates = [...unique.values()];
  const advanceVerification = trackProgress("architecture_verify", candidates.length);
  const checked = await mapWithConcurrency(candidates, config.concurrency.judging, async (candidate) => {
    try {
      const session = await runReviewSession<Record<string, unknown>>(learningExplanation ? `${VERIFY}\n\n${LEARNING_EXPLANATION}` : VERIFY,
        `Regel: ${ruleInput([candidate.rule])}\n` +
        `Unbestaetigter Kandidat: ${JSON.stringify({ path: candidate.path, line: candidate.line, side: candidate.side, hypothesis: candidate.hypothesis })}\n` +
        `Originaldiff:\n${candidateDiff(files, candidate.path, candidate.line, candidate.side)}`,
        { searchRounds: config.budget.searchRounds, fileReads: config.budget.fileReads },
        { model: config.verifyModel, baseReads: true, preload: { path: candidate.path, line: candidate.line,
          ...(candidate.side === "old" ? { revision: "base" as const } : {}) } });
      recordCoverage([candidate.rule], session);
      if (session.result.value.status === "rejected") {
        if (!text(session.result.value.reason)) throw new Error("Verworfener Kandidat ohne Gegenbegründung.");
        coverage.get(candidate.rule.id)!.rejected += 1;
        return null;
      }
      if (session.result.value.status === "inconclusive") {
        const state = coverage.get(candidate.rule.id)!;
        state.incomplete = true;
        if (state.missing.length < 3) state.missing.push(text(session.result.value.reason, 300) || "Erforderliche Belege fehlen.");
        return null;
      }
      const verified = architectureVerification(session.result.value, candidate, session.result.excerpts, learningExplanation);
      if (!verified) throw new Error("NC ohne vollständig gelesene Belege, MR-Bezug oder konkrete Verbesserung verworfen.");
      const evidence = await Promise.all(verified.evidence.map(async (entry) => ({ ...entry,
        snippet: await loadEvidenceSnippet(entry.path, entry.startLine, entry.endLine, entry.revision) })));
      const usage: TokenUsage = session.usage;
      return { id: randomUUID(), rule: candidate.rule, verdict: "NC" as const,
        rationale: verified.rationale, consequence: verified.consequence, suggestion: verified.suggestion,
        anchor: { path: candidate.path, line: candidate.line, ...(candidate.side ? { side: candidate.side } : {}) }, evidence,
        trace: [...candidate.trace, ...session.result.trace].map((entry, index) => ({ ...entry, step: index + 1 })),
        budgetExhausted: session.result.budgetExhausted, modelCalls: session.usage.modelCalls, tokenUsage: usage };
    } catch (error) {
      recordCoverage([candidate.rule]);
      failures.push({ stage: "reader", ruleId: candidate.rule.id, message: `${candidate.path}:${candidate.line}: ${(error as Error).message}` });
      return null;
    } finally { advanceVerification(); }
  });
  const verificationMs = Math.round(performance.now() - verificationStartedAt);
  // 5. Erst bestätigte Verstöße nach gemeinsamer Ursache deduplizieren.
  const deduplicationStartedAt = performance.now();
  const confirmed = await deduplicate(checked.filter((entry): entry is NonNullable<typeof entry> => entry !== null), failures);
  const deduplicationMs = Math.round(performance.now() - deduplicationStartedAt);
  const byRule = new Map<string, Finding[]>();
  for (const finding of confirmed) {
    const entries = byRule.get(finding.rule.id) ?? [];
    entries.push(finding);
    byRule.set(finding.rule.id, entries);
  }
  // Ein regelbezogenes Ergebnis bleibt auch ohne konkreten Verstoß sichtbar.
  const findings: Finding[] = selected.selected.flatMap((rule) => {
    const state = coverage.get(rule.id)!;
    return byRule.get(rule.id) ?? [{
      id: randomUUID(), rule, verdict: "CIA" as const,
      rationale: (state.missing.length ? `Nicht entscheidbar; fehlender Kontext: ${state.missing.join(" ")}` : state.incomplete
        ? "Prüfung unvollständig: Werkzeug-/Kontextbudget, ungültige Kandidaten oder ein Analysefehler begrenzen die Aussage."
        : "Für diese Änderung wurde kein konkret belegter Verstoß gefunden; die Einhaltung ist damit nicht nachgewiesen.") +
        ` ${state.searches} Suchzugriffe, ${state.reads} Dateiöffnungen, ${state.rejected} verworfene Verdachtsfälle.`,
      coverage: { status: state.incomplete ? "incomplete" as const : "no_violation" as const,
        searches: state.searches, reads: state.reads, rejectedCandidates: state.rejected },
      evidence: [], trace: [], budgetExhausted: state.exhausted, modelCalls: 0,
    }];
  });
  log.info("architecture_review_done", { chunks: chunks.length, candidates: candidates.length, confirmed: confirmed.length, failures: failures.length });
  return { findings, dropped: selected.dropped, failures, triageMs,
    metrics: { searchMs, integrationMs, verificationMs, deduplicationMs, candidates: candidates.length, confirmed: confirmed.length } };
}
