"use client";

/**
 * Rückmeldung am einzelnen Befund (FA-15, Abschnitt 7.5).
 *
 * Bewertet wird die einzelne, belegte Fundstelle und nicht der Review als
 * Ganzes: Zu einem Gesamturteil ist eine unabhängige Einschätzung kaum
 * möglich, weil man sich an der vorgelegten Begründung verankert.
 *
 * Die Bewertung geht sofort raus; der freie Kommentar wird beim Verlassen des
 * Feldes nachgereicht. Ein Absenden-Knopf würde eine Rückmeldung verlieren,
 * sobald jemand ihn übersieht.
 */

import { useState } from "react";
import type { FeedbackEntry } from "@/lib/types";

type SubmitState = "idle" | "saving" | "saved" | "error";

const STATE_MESSAGE: Record<SubmitState, string> = {
  idle: "",
  saving: "wird gespeichert …",
  saved: "Rückmeldung gespeichert.",
  error: "Speichern fehlgeschlagen.",
};

export default function FeedbackForm({
  reviewId,
  findingId,
  existing,
}: {
  reviewId: string;
  findingId: string;
  existing?: FeedbackEntry;
}) {
  const [rating, setRating] = useState<FeedbackEntry["rating"] | null>(
    existing?.rating ?? null,
  );
  const [comment, setComment] = useState(existing?.comment ?? "");
  const [state, setState] = useState<SubmitState>(existing ? "saved" : "idle");

  async function submit(next: FeedbackEntry["rating"]) {
    setRating(next);
    setState("saving");
    try {
      const response = await fetch(`/api/findings/${findingId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId, rating: next, comment }),
      });
      setState(response.ok ? "saved" : "error");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="feedback">
      <button
        type="button"
        onClick={() => void submit("up")}
        aria-pressed={rating === "up"}
      >
        👍 hilfreich
      </button>
      <button
        type="button"
        onClick={() => void submit("down")}
        aria-pressed={rating === "down"}
      >
        👎 nicht hilfreich
      </button>

      <textarea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        // Ohne Bewertung gibt es nichts zu speichern; der Kommentar allein
        // ergibt keinen Eintrag.
        onBlur={() => {
          if (rating) void submit(rating);
        }}
        placeholder="Woran lag es? (optional)"
        rows={1}
        aria-label="Kommentar zur Rückmeldung"
      />

      <span className="meta">{STATE_MESSAGE[state]}</span>
    </div>
  );
}
