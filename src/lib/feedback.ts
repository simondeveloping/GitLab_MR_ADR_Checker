import { updateReview } from "./store";
import type { FeedbackEntry } from "./types";

export function isRating(value: unknown): value is FeedbackEntry["rating"] {
  return value === "up" || value === "down";
}

export async function recordFeedback(
  reviewId: string,
  findingId: string,
  rating: FeedbackEntry["rating"],
  comment?: string,
): Promise<FeedbackEntry | "unknown review" | "unknown finding"> {
  let feedback: FeedbackEntry | undefined;
  const review = await updateReview(reviewId, (current) => {
    if (!current.result?.findings.some((finding) => finding.id === findingId)) return false;
    feedback = {
      findingId,
      rating,
      comment: comment?.trim() || undefined,
      createdAt: new Date().toISOString(),
    };
    // Prüfung und Schreiben liegen in derselben Warteschlange.
    current.feedback = (current.feedback ?? []).filter((entry) => entry.findingId !== findingId);
    current.feedback.push(feedback);
  });
  if (!review) return "unknown review";
  return feedback ?? "unknown finding";
}
