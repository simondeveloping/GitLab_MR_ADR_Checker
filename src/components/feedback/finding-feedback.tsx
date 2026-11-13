import { Check, ThumbsDown, ThumbsUp } from "lucide-react";
import type { FeedbackEntry } from "@/lib/types";

export function FindingFeedback({
  reviewId,
  findingId,
  initialFeedback,
}: {
  reviewId: string;
  findingId: string;
  initialFeedback?: FeedbackEntry;
}) {
  const rating = initialFeedback?.rating;

  return (
    <div className="finding-feedback">
      <span className="finding-feedback-prompt">War diese Bemerkung hilfreich?</span>
      <div className="finding-feedback-actions">
        {(["up", "down"] as const).map((value) => {
          const selected = rating === value;
          const label = value === "up" ? "Hilfreich" : "Nicht hilfreich";
          const Icon = value === "up" ? ThumbsUp : ThumbsDown;
          return (
            <form key={value} action={`/api/findings/${encodeURIComponent(findingId)}/feedback`} method="get">
              <input type="hidden" name="review" value={reviewId} />
              <input type="hidden" name="rating" value={value} />
              <button
                type="submit"
                className={`feedback-choice${selected ? " is-selected" : ""}`}
                aria-label={value === "up" ? "Bemerkung hilfreich" : "Bemerkung nicht hilfreich"}
                title={label}
                aria-pressed={selected}
              >
                <Icon size={17} fill={selected ? "currentColor" : "none"} />
              </button>
            </form>
          );
        })}
        {rating ? <span className="feedback-saved"><Check size={13} /> Gespeichert</span> : null}
      </div>
    </div>
  );
}
