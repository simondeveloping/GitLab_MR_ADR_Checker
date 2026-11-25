/** Lernreview: Diffteile -> bedarfsgesteuerte Integration -> Verifikation samt Kommentar. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config.js";
import { mapWithConcurrency } from "./concurrency.js";
import { trackProgress } from "./progress.js";
import {
  candidateDiff, chunkReviewDiff, parseReviewDiff,
  type ReviewChunk,
} from "./review-diff.js";
import { runReviewSession } from "./review-session.js";
import { log } from "./trace.js";
import type { AgentFailure, Finding, LearningStats, ToolCallTrace } from "./types.js";
import { learningIntegrationReason } from "./learning-policy.js";
import { reviewChanges, reviewChunkChanges, type ReviewChanges } from "./review-changes.js";
import { modelStrings as strings, modelText as text } from "./llm.js";
import {
  candidateCard, duplicateCandidateIds, learningFinding, readLearningCandidates,
  verifiedCard, verifyLearningCandidate, type Candidate, type VerifiedCandidate,
} from "./learning-findings.js";
import { COLLECT_PROMPT, INTEGRATION_PROMPT, VERIFY_PROMPT, DEDUP_PROMPT } from "./learning-prompts.js";

interface Collection {
  chunk: ReviewChunk;
  summary: string;
  interfaces: string[];
  candidates: Candidate[];
  failed: boolean;
  incomplete: boolean;
  integrationNeeded: boolean;
  openQuestions: string[];
}

/** Begrenzt auch Zusammenfassungs-/Dublettenphasen, nicht nur den Originaldiff. */
function batches<T>(items: T[], describe: (item: T) => unknown, maxBytes = 24_000): T[][] {
  const result: T[][] = [];
  let batch: T[] = [];
  let bytes = 0;
  for (const item of items) {
    const size = Buffer.byteLength(JSON.stringify(describe(item)));
    if (batch.length > 0 && (bytes + size > maxBytes || batch.length >= 8)) {
      result.push(batch);
      batch = [];
      bytes = 0;
    }
    batch.push(item);
    bytes += size;
  }
  if (batch.length > 0) result.push(batch);
  return result;
}

export async function reviewForLearning(): Promise<{ findings: Finding[]; failures: AgentFailure[]; metrics: LearningStats }> {
  const failures: AgentFailure[] = [];
  const metrics: LearningStats = { collectionMs: 0, integrationMs: 0, verificationMs: 0, deduplicationMs: 0, formattingMs: 0,
    chunks: 0, incompleteUnits: 0, candidates: 0, confirmed: 0, rejected: 0, inconclusive: 0, verificationErrors: 0,
    invalidCandidates: 0, integrationReason: "no_changes", openIssues: [] };
  const fail = (unit: string, error: unknown) => {
    const message = `${unit}: ${error instanceof Error ? error.message : String(error)}`;
    failures.push({ stage: "learning", message });
    log.warn("learning_unit_failed", { unit, message });
  };
  const patch = await readFile(join(config.repoDir, config.patchFile), "utf8");
  const files = parseReviewDiff(patch);
  const changes = reviewChanges(files);
  if (!changes.added.size && !changes.removed.size) return { findings: [], failures, metrics };
  const chunks = chunkReviewDiff(files, config.learningBudget.chunkBytes);
  metrics.chunks = chunks.length;
  const budget = config.learningBudget;
  const concurrency = config.concurrency.learning;
  const maxCandidates = Math.max(1, Math.floor(budget.maxFindings));
  const overviewLines: string[] = [];
  let overviewBytes = 0;
  for (const file of files) {
    const line = JSON.stringify({ path: file.path, previous: file.oldPath,
      added: changes.added.get(file.path)?.size ?? 0, removed: changes.removed.get(file.oldPath)?.size ?? 0, hunks: file.hunks.length });
    if (overviewBytes + Buffer.byteLength(line) > 8_000) break;
    overviewLines.push(line);
    overviewBytes += Buffer.byteLength(line);
  }
  const overview = `MR-Uebersicht: ${files.length} Textdateien, ${chunks.length} Diffteile.\n` +
    overviewLines.join("\n") + (overviewLines.length < files.length
      ? "\nWeitere Dateien: vollstaendige Liste und Originaldiff in mr_diff.patch; gezielt mit grep/read_file untersuchen."
      : "");
  const readCandidates = (raw: unknown, trace: ToolCallTrace[], allowed: ReviewChanges = changes): { candidates: Candidate[]; incomplete: boolean } => {
    const { candidates, invalid, incomplete } = readLearningCandidates(raw, trace, allowed, maxCandidates);
    if (invalid) log.info("learning_candidates_discarded", { reason: "invalid_candidate_or_anchor", count: invalid });
    metrics.invalidCandidates += invalid;
    return { candidates, incomplete };
  };
  log.info("learning_plan", { patchBytes: Buffer.byteLength(patch), changedFiles: files.length,
    chunks: chunks.length, chunkBytes: budget.chunkBytes, concurrency, maxCandidatesPerUnit: maxCandidates });

  // 1. Alle Diffteile erhalten einen frischen Kontext und Zugriff auf den ganzen Klon.
  const collectionStartedAt = performance.now();
  const advanceCollection = trackProgress("learning_collect", chunks.length);
  const collections = await mapWithConcurrency(chunks, concurrency, async (chunk): Promise<Collection> => {
    try {
      if (chunk.oversized) throw new Error("Eine einzelne Diffzeile überschreitet das Teilbudget; diese Einheit bleibt ungeprüft.");
      log.info("learning_collect_start", { unit: chunk.id, paths: chunk.paths });
      const session = await runReviewSession<Record<string, unknown>>(COLLECT_PROMPT,
        `${overview}\n\nEinheit ${chunk.id}. Sammle hoechstens ${maxCandidates} Kandidaten.\n` +
        `Fasse summary in hoechstens 1000 Zeichen und interfaces/open_questions in hoechstens 8 kurzen Punkten zusammen.\n\n${chunk.diff}`, budget,
        { model: config.learningModels.search, baseReads: true });
      const value = session.result.value;
      const { candidates, incomplete } = readCandidates(value.candidates, session.result.trace, reviewChunkChanges(chunk));
      const validSummary = text(value.summary).length > 0 && typeof value.integration_needed === "boolean" &&
        [value.interfaces, value.open_questions].every((list) => Array.isArray(list) && list.every((entry) => typeof entry === "string"));
      const partial = incomplete || !validSummary || session.result.budgetExhausted;
      if (partial) metrics.incompleteUnits += 1;
      log.info("learning_collect_done", { unit: chunk.id, candidates: candidates.length, budgetExhausted: session.result.budgetExhausted });
      return { chunk, summary: text(value.summary, 1000), interfaces: strings(value.interfaces, 8, 350), candidates, failed: false,
        incomplete: partial, integrationNeeded: value.integration_needed !== false,
        openQuestions: strings(value.open_questions, 8, 350) };
    } catch (error) {
      metrics.incompleteUnits += 1;
      fail(`Sammeln ${chunk.id}`, error);
      return { chunk, summary: "Analyse fehlgeschlagen; Originalaenderung bei relevanten Verbindungen selbst untersuchen.", interfaces: [], candidates: [], failed: true,
        incomplete: true, integrationNeeded: true, openQuestions: [] };
    } finally {
      advanceCollection();
    }
  });
  metrics.collectionMs = Math.round(performance.now() - collectionStartedAt);

  // 2. Integrationspakete bleiben klein; jeder Lauf darf beliebige Repo-Verbindungen verfolgen.
  const collectionCard = (entry: Collection) => ({
    unit: entry.chunk.id, paths: entry.chunk.paths, summary: entry.summary,
    interfaces: entry.interfaces, failed: entry.failed,
    incomplete: entry.incomplete, open_questions: entry.openQuestions,
    candidates: entry.candidates.map((candidate) => ({ path: candidate.path, line: candidate.line, side: candidate.side, title: candidate.title })),
  });
  metrics.integrationReason = learningIntegrationReason(files, chunks, collections.map((entry) => ({ ...entry,
    relatedPaths: entry.candidates.flatMap((candidate) => candidate.relatedPaths) })), config.learningIntegration);
  log.info("learning_integration_decision", { reason: metrics.integrationReason });
  const integrationGroups = metrics.integrationReason === "local_complete" ? [] : batches(collections, collectionCard);
  const integrationStartedAt = performance.now();
  const advanceIntegration = trackProgress("learning_integration", integrationGroups.length);
  const integrated = await mapWithConcurrency(integrationGroups, concurrency, async (group, index) => {
    try {
      log.info("learning_integration_start", { unit: index + 1, chunks: group.map((entry) => entry.chunk.id) });
      const session = await runReviewSession<Record<string, unknown>>(INTEGRATION_PROMPT,
        `${overview}\n\nSammle hoechstens ${maxCandidates} zusaetzliche Kandidaten.\nBerichte:\n` +
        JSON.stringify(group.map(collectionCard)), budget, { model: config.learningModels.search, baseReads: true });
      const parsed = readCandidates(session.result.value.candidates, session.result.trace);
      if (parsed.incomplete || session.result.budgetExhausted) metrics.incompleteUnits += 1;
      return parsed.candidates;
    } catch (error) {
      metrics.incompleteUnits += 1;
      fail(`Integration ${index + 1}`, error);
      return [];
    } finally {
      advanceIntegration();
    }
  });
  metrics.integrationMs = Math.round(performance.now() - integrationStartedAt);
  // Exakte Wiederholungen sparen Verifikationsaufrufe; semantische Dubletten werden
  // erst anhand bestaetigter Ursachen entfernt, damit Hypothesen nichts verdecken.
  const seen = new Set<string>();
  const candidates = [...collections.flatMap((entry) => entry.candidates), ...integrated.flat()].filter((candidate) => {
    const key = JSON.stringify([candidate.path, candidate.line, candidate.side, candidate.title.toLowerCase(), candidate.hypothesis.toLowerCase()]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  metrics.candidates = candidates.length;

  // 3. Jeden Kandidaten unabhaengig am Originalcode mit Gegenbelegsuche verifizieren.
  log.info("learning_verification_start", { candidates: candidates.length });
  const advanceVerification = trackProgress("learning_verify", candidates.length);
  const verificationStartedAt = performance.now();
  const checked = await mapWithConcurrency(candidates, concurrency, async (candidate): Promise<VerifiedCandidate | null> => {
    try {
      const session = await runReviewSession<Record<string, unknown>>(VERIFY_PROMPT,
        `Kandidat (unbestaetigt):\n${JSON.stringify(candidateCard(candidate))}\n\nOriginaldiff:\n` +
        candidateDiff(files, candidate.path, candidate.line, candidate.side), budget,
        { model: config.learningModels.verify, baseReads: true, preload: { path: candidate.path, line: candidate.line,
          ...(candidate.side === "old" ? { revision: "base" as const } : {}) } });
      const value = session.result.value;
      if (value.status === "rejected") {
        if (!text(value.reason)) throw new Error("Widerlegung ohne Gegenbegründung.");
        metrics.rejected += 1;
        log.info("learning_candidate_rejected", { candidateId: candidate.id, reason: text(value.reason) });
        return null;
      }
      if (value.status === "inconclusive") {
        const reason = text(value.reason, 400);
        if (!reason) throw new Error("Offener Verdachtsfall ohne Angabe fehlender Belege.");
        metrics.inconclusive += 1;
        if (metrics.openIssues.length < 10) metrics.openIssues.push({ path: candidate.path, line: candidate.line,
          ...(candidate.side ? { side: candidate.side } : {}), reason });
        return null;
      }
      if (value.status !== "confirmed") throw new Error("Verifikationsentscheidung fehlt.");
      return verifyLearningCandidate(candidate, session);
    } catch (error) {
      metrics.verificationErrors += 1;
      fail(`Verifikation ${candidate.path}:${candidate.line}`, error);
      return null;
    } finally {
      advanceVerification();
    }
  });
  metrics.verificationMs = Math.round(performance.now() - verificationStartedAt);
  const verified = checked.filter((entry): entry is VerifiedCandidate => entry !== null);
  metrics.confirmed = verified.length;

  // 4. Ursachenbasierte Dublettenpruefung mit begrenzten Vergleichspaketen.
  log.info("learning_deduplication_start", { verified: verified.length });
  const deduplicationStartedAt = performance.now();
  const unique: VerifiedCandidate[] = [];
  const deduplicationGroups = batches(verified, verifiedCard, 16_000);
  const advanceDeduplication = trackProgress("learning_deduplicate", deduplicationGroups.length);
  for (const group of deduplicationGroups) {
    if (group.length === 1 && unique.length === 0) {
      unique.push(group[0]);
      advanceDeduplication();
      continue;
    }
    let incoming = group;
    const existingGroups = batches(unique, verifiedCard, 16_000);
    for (const existing of existingGroups.length ? existingGroups : [[]]) {
      if (incoming.length === 0) break;
      try {
        const session = await runReviewSession<Record<string, unknown>>(DEDUP_PROMPT,
          JSON.stringify({ existing: existing.map(verifiedCard), incoming: incoming.map(verifiedCard) }),
          { searchRounds: 0, fileReads: 0 }, { model: config.learningModels.deduplicate });
        const removed = duplicateCandidateIds(session.result.value.duplicates, existing, incoming);
        incoming = incoming.filter((entry) => !removed.has(entry.candidate.id));
        log.info("learning_duplicates_removed", { count: removed.size });
      } catch (error) {
        fail("Dublettenprüfung", error);
      }
    }
    unique.push(...incoming);
    advanceDeduplication();
  }
  metrics.deduplicationMs = Math.round(performance.now() - deduplicationStartedAt);

  // 5. Verifizierte Formulierungen deterministisch übernehmen, ohne weiteres Modell.
  const formattingStartedAt = performance.now();
  log.info("learning_description_start", { findings: unique.length });
  const advanceDescription = trackProgress("learning_describe", unique.length);
  const described = unique.map((entry): Finding => {
    advanceDescription();
    return learningFinding(entry);
  });
  metrics.formattingMs = Math.round(performance.now() - formattingStartedAt);
  log.info("learning_review_done", { chunks: chunks.length,
    completedChunks: collections.filter((entry) => !entry.failed).length,
    candidates: candidates.length, verified: verified.length, findings: described.length, failures: failures.length });
  return { findings: described, failures, metrics };
}
