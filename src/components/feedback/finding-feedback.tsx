"use client";

import { useRef, useState } from "react";
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
  const [rating, setRating] = useState(initialFeedback?.rating);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function saveRating(value: FeedbackEntry["rating"]) {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setError(null);
    const previous = rating;
    setRating(value);
    try {
      const response = await fetch(`/api/findings/${encodeURIComponent(findingId)}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId, rating: value }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error("Feedback konnte nicht gespeichert werden.");
    } catch {
      setRating(previous);
      setError("Feedback konnte nicht gespeichert werden. Bitte erneut versuchen.");
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="finding-feedback">
      <span className="finding-feedback-prompt">War diese Bemerkung hilfreich?</span>
      <div className="finding-feedback-actions" aria-busy={saving}>
        {(["up", "down"] as const).map((value) => {
          const selected = rating === value;
          const label = value === "up" ? "Hilfreich" : "Nicht hilfreich";
          const Icon = value === "up" ? ThumbsUp : ThumbsDown;
          return (
            <button
              key={value}
              type="button"
              disabled={saving}
              onClick={() => void saveRating(value)}
              className={`feedback-choice${selected ? " is-selected" : ""}`}
              data-rating={value}
              aria-label={value === "up" ? "Bemerkung hilfreich" : "Bemerkung nicht hilfreich"}
              title={label}
              aria-pressed={selected}
            >
              <Icon size={17} fill={selected ? "currentColor" : "none"} />
            </button>
          );
        })}
        <span className="feedback-saved" role="status">
          {saving ? "Wird gespeichert …" : rating ? <><Check size={13} /> Gespeichert</> : null}
        </span>
      </div>
      {error ? <p className="interaction-error" role="alert">{error}</p> : null}
    </div>
  );
}
