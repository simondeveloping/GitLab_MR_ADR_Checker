/** Kandidaten des Lernreviews: Modellantworten prüfen und bestätigte Befunde abbilden. */
import { randomUUID } from "node:crypto";
import { reviewAnchor, type ReviewAnchor, type ReviewChanges } from "./review-changes.js";
import {
  evidenceMatchesAnchor,
  evidenceSupportsCandidate,
  verifiedEvidence,
  type ReviewSession,
} from "./review-session.js";
import { modelObject as object, modelStrings as strings, modelText as text } from "./llm.js";
import type { Evidence, Finding, ToolCallTrace } from "./types.js";

export interface Candidate extends ReviewAnchor {
  id: string;
  title: string;
  hypothesis: string;
  check: string;
  relatedPaths: string[];
  trace: ToolCallTrace[];
}

export interface VerifiedCandidate {
  candidate: Candidate;
  title: string;
  why: string;
  consequence: string;
  suggestion: string;
  evidence: Evidence[];
  trace: ToolCallTrace[];
  budgetExhausted: boolean;
  modelCalls: number;
  tokenUsage: NonNullable<Finding["tokenUsage"]>;
}

export function candidateCard(candidate: Candidate) {
  return {
    id: candidate.id,
    path: candidate.path,
    line: candidate.line,
    title: candidate.title,
    ...(candidate.side ? { side: candidate.side } : {}),
    hypothesis: candidate.hypothesis,
    check: candidate.check,
    related_paths: candidate.relatedPaths,
  };
}

export function verifiedCard(entry: VerifiedCandidate) {
  return {
    id: entry.candidate.id,
    path: entry.candidate.path,
    line: entry.candidate.line,
    side: entry.candidate.side,
    title: entry.title,
    why: entry.why,
    consequence: entry.consequence,
    suggestion: entry.suggestion,
  };
}

/** Behält gültige Kandidaten bis zum Teilbudget; unvollständige Antworten bleiben erkennbar. */
export function readLearningCandidates(
  raw: unknown,
  trace: ToolCallTrace[],
  allowed: ReviewChanges,
  maxCandidates: number,
): { candidates: Candidate[]; invalid: number; incomplete: boolean } {
  if (!Array.isArray(raw)) throw new Error("Kandidatenliste fehlt in der Modellantwort.");
  const candidates: Candidate[] = [];
  let invalid = 0;
  for (const value of raw) {
    const item = object(value);
    const anchor = reviewAnchor(item, allowed);
    const title = text(item.title, 180);
    const hypothesis = text(item.hypothesis, 900);
    const check = text(item.check, 500);
    if (!anchor || anchor.path.length > 1000 || !title || !hypothesis) {
      invalid += 1;
      continue;
    }
    candidates.push({
      id: randomUUID(),
      ...anchor,
      title,
      hypothesis,
      check,
      relatedPaths: strings(item.related_paths, 6, 500),
      trace,
    });
    if (candidates.length >= maxCandidates) break;
  }
  return { candidates, invalid, incomplete: invalid > 0 || raw.length > maxCandidates };
}

/** Der Aufrufer hat status="confirmed" geprüft; hier folgen Pflichtfelder und Originalbelege. */
export function verifyLearningCandidate(
  candidate: Candidate,
  session: ReviewSession<Record<string, unknown>>,
): VerifiedCandidate {
  const value = session.result.value;
  const evidence = verifiedEvidence(value.evidence, session.result.excerpts);
  const title = text(value.title, 180);
  const why = text(value.why);
  const consequence = text(value.consequence);
  const suggestion = text(value.suggestion);
  if (
    !title || !why || !consequence || !suggestion || !evidence ||
    !evidenceSupportsCandidate(evidence, candidate, value.required_paths)
  ) {
    throw new Error("Bestätigter Kandidat hat unvollständige Angaben oder nicht gelesene/fehlende Pflichtbelege.");
  }
  return {
    candidate, title, why, consequence, suggestion, evidence,
    trace: [...candidate.trace, ...session.result.trace].map((entry, index) => ({ ...entry, step: index + 1 })),
    budgetExhausted: session.result.budgetExhausted,
    modelCalls: session.usage.modelCalls, tokenUsage: session.usage,
  };
}

/** Nur gültige Referenzen auf erhaltene, vorherige Vertreter dürfen Befunde entfernen. */
export function duplicateCandidateIds(
  duplicates: unknown,
  existing: VerifiedCandidate[],
  incoming: VerifiedCandidate[],
): Set<string> {
  if (!Array.isArray(duplicates)) throw new Error("Dublettenentscheidung fehlt.");
  const removed = new Set<string>();
  const existingIds = new Set(existing.map((entry) => entry.candidate.id));
  const positions = new Map(incoming.map((entry, index) => [entry.candidate.id, index]));
  for (const raw of duplicates) {
    const duplicate = object(raw);
    const id = text(duplicate.id);
    const target = text(duplicate.duplicate_of);
    const position = positions.get(id);
    const targetPosition = positions.get(target);
    if (position === undefined || id === target || removed.has(id)) {
      throw new Error("Ungültige Dublettenreferenz; Vergleichspaket bleibt erhalten.");
    }
    const hasEarlierRepresentative = existingIds.has(target) ||
      (targetPosition !== undefined && targetPosition < position);
    if (!hasEarlierRepresentative) {
      throw new Error("Ungültige Dublettenreferenz; Vergleichspaket bleibt erhalten.");
    }
    removed.add(id);
  }
  // Erst das ganze Paket validieren: auch ein später gelöschter Vertreter ist ungültig.
  if (duplicates.some((raw) => removed.has(text(object(raw).duplicate_of)))) {
    throw new Error("Verkettete Dublettenreferenz; Vergleichspaket bleibt erhalten.");
  }
  return removed;
}

/** Übernimmt ausschließlich die bereits verifizierten Formulierungen. */
export function learningFinding(entry: VerifiedCandidate): Finding {
  const { path, line, side } = entry.candidate;
  // verifyLearningCandidate garantiert diesen Beleg; zuerst anzeigen, damit der MR-Bezug sofort sichtbar ist.
  const anchorEvidence = entry.evidence.find((evidence) => evidenceMatchesAnchor(evidence, entry.candidate))!;
  return {
    id: randomUUID(),
    rule: {
      id: randomUUID(),
      text: entry.title,
      adrTitle: "Lernfreundlicher Code-Review",
      adrFile: "Lernmodus",
      origin: "learning",
    },
    verdict: "NC",
    rationale: entry.why,
    consequence: entry.consequence,
    suggestion: entry.suggestion,
    anchor: { path, line, ...(side ? { side } : {}) },
    evidence: [anchorEvidence, ...entry.evidence.filter((evidence) => evidence !== anchorEvidence)],
    trace: entry.trace,
    budgetExhausted: entry.budgetExhausted,
    modelCalls: entry.modelCalls,
    tokenUsage: entry.tokenUsage,
  };
}
