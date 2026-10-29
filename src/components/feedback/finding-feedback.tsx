"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
  const [rating, setRating] = useState<FeedbackEntry["rating"] | undefined>(initialFeedback?.rating);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function submit(nextRating: FeedbackEntry["rating"]) {
    const previousRating = rating;
    setRating(nextRating);
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch(`/api/findings/${encodeURIComponent(findingId)}/feedback`, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId, rating: nextRating }),
      });
      const payload = await response.json().catch(() => null) as { status?: string; error?: string } | null;
      if (!response.ok || payload?.status !== "ok") {
        throw new Error(payload?.error ?? `Feedback konnte nicht gespeichert werden (${response.status}).`);
      }
      setMessage("Feedback gespeichert");
      router.refresh();
    } catch (error) {
      setRating(previousRating);
      setMessage(error instanceof Error ? error.message : "Feedback konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="finding-feedback">
      <span className="finding-feedback-prompt">War diese Bemerkung hilfreich?</span>
      <div className="finding-feedback-actions">
        <button
          type="button"
          data-rating="up"
          className={`feedback-choice${rating === "up" ? " is-selected" : ""}`}
          onClick={() => void submit("up")}
          disabled={saving}
          aria-label="Bemerkung hilfreich"
          title="Hilfreich"
          aria-pressed={rating === "up"}
        >
          <ThumbsUp size={17} fill={rating === "up" ? "currentColor" : "none"} />
        </button>
        <button
          type="button"
          data-rating="down"
          className={`feedback-choice${rating === "down" ? " is-selected" : ""}`}
          onClick={() => void submit("down")}
          disabled={saving}
          aria-label="Bemerkung nicht hilfreich"
          title="Nicht hilfreich"
          aria-pressed={rating === "down"}
        >
          <ThumbsDown size={17} fill={rating === "down" ? "currentColor" : "none"} />
        </button>
        {rating ? <span className="feedback-saved"><Check size={13} /> {saving ? "Speichert …" : "Gespeichert"}</span> : null}
      </div>
      {message ? <span className={`finding-feedback-message${message === "Feedback gespeichert" ? " is-success" : " is-error"}`} role="status">{message}</span> : null}
    </div>
  );
}
