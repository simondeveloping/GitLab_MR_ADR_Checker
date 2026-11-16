import { findingsOf, verdictCounts } from "./findings";
import type { Review, ReviewStatus, SandboxResult, Verdict } from "./types";

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  queued: "Warteschlange",
  running: "In Bearbeitung",
  completed: "Abgeschlossen",
  failed: "Fehlgeschlagen",
};

export function isActiveReview(status: ReviewStatus): boolean {
  return status === "queued" || status === "running";
}

export function reviewHasFailures(review: Review): boolean {
  return review.status === "failed" || Boolean(review.error) ||
    review.sandboxProgress?.phase === "error" || review.sandboxProgress?.phase === "timeout";
}

/** Nur die für die Liste benötigten Daten werden an den Browser übertragen. */
export interface ReviewSummary {
  id: string;
  status: ReviewStatus;
  createdAt: string;
  mr: Pick<Review["mr"], "title" | "projectPath" | "mrIid" | "webUrl">;
  error?: string;
  checks: number;
  verdicts: Record<Verdict, number>;
  hasResult: boolean;
  mode?: SandboxResult["mode"];
}

export function summarizeReview(review: Review): ReviewSummary {
  const findings = findingsOf(review);
  return {
    id: review.id,
    status: review.status,
    createdAt: review.createdAt,
    mr: { title: review.mr.title, projectPath: review.mr.projectPath, mrIid: review.mr.mrIid, webUrl: review.mr.webUrl },
    error: review.error,
    checks: findings.length,
    verdicts: verdictCounts(findings),
    hasResult: Boolean(review.result),
    mode: review.result?.mode,
  };
}

export interface ProgressSnapshot {
  status: ReviewStatus;
  progress?: Review["sandboxProgress"];
}
