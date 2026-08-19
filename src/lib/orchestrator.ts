/**
 * Steuerung eines Reviews im Backend (Abschnitt 7.2).
 *
 * Der Ablauf verteilt sich auf drei Orte: In GitLab entsteht der Anlass und
 * landet am Ende das Ergebnis, dieses Backend läuft dauerhaft und nimmt die
 * Meldung entgegen, und die eigentliche Prüfung findet in einer eigens
 * gestarteten Sandbox statt, die nach dem Lauf wieder verschwindet.
 *
 * Der Webhook-Endpunkt quittiert sofort und ruft `startReview` ohne `await`
 * auf: Ein Prüflauf dauert Minuten, und GitLab würde die Zustellung
 * andernfalls als fehlgeschlagen werten.
 */

import { randomBytes, randomUUID } from "node:crypto";
import { env } from "./env";
import { renderPlaceholder } from "./comment";
import { createNote, deleteNote, loadMergeRequestContext } from "./gitlab";
import { runSandbox } from "./sandbox";
import {
  getReviewAfterPendingWrites,
  newReviewId,
  saveReview,
  updateReview,
} from "./store";
import type { Review } from "./types";

/** Legt den Review-Datensatz an, bevor irgendetwas Langlaufendes beginnt. */
export async function createReview(
  projectId: number,
  mrIid: number,
): Promise<Review> {
  const mr = await loadMergeRequestContext(projectId, mrIid);
  const now = new Date().toISOString();

  const review: Review = {
    id: newReviewId(),
    status: "queued",
    createdAt: now,
    updatedAt: now,
    mr,
    callbackToken: randomBytes(32).toString("hex"),
    feedback: [],
  };

  await saveReview(review);
  return review;
}

/**
 * Startet den Prüflauf. Läuft im Hintergrund und wirft nie: Fehler landen im
 * Review-Datensatz, damit ein hängender Review keinen Merge aufhält
 * (FA-12, NFA-9).
 */
export async function startReview(review: Review): Promise<void> {
  try {
    // Damit die Entwickelnden wissen, dass etwas läuft (Abschnitt 7.2.1).
    const noteId = await createNote(
      review.mr.projectId,
      review.mr.mrIid,
      renderPlaceholder(review.id, env.publicBaseUrl),
    );

    await updateReview(review.id, (r) => {
      r.status = "running";
      r.placeholderNoteId = noteId;
    });
    review.placeholderNoteId = noteId;
    review.status = "running";
  } catch (error) {
    await failReview(review.id, `Vorbereitung fehlgeschlagen: ${String(error)}`);
    return;
  }

  const outcome = await runSandbox(review);

  await updateReview(review.id, (r) => {
    r.sandboxLog = outcome.log;
  });

  // Der Regelfall ist, dass die Sandbox ihr Ergebnis selbst per Callback
  // gemeldet hat, bevor der Container endet. Ist das nicht geschehen, ist der
  // Lauf gescheitert.
  const current = await getReviewAfterPendingWrites(review.id);
  if (current?.status === "running") {
    const reason = outcome.timedOut
      ? `Zeitlimit von ${env.sandboxTimeoutSeconds}s überschritten.`
      : `Sandbox endete mit Code ${outcome.exitCode} ohne Ergebnis zu melden.`;
    await failReview(review.id, reason);
  }
}

/** Entfernt den Hinweiskommentar; Fehler dabei dürfen den Lauf nicht kippen. */
export async function removePlaceholder(review: Review): Promise<void> {
  if (!review.placeholderNoteId) return;
  try {
    await deleteNote(
      review.mr.projectId,
      review.mr.mrIid,
      review.placeholderNoteId,
    );
    await updateReview(review.id, (r) => {
      r.placeholderNoteId = undefined;
    });
  } catch {
    // Der Kommentar wurde vermutlich schon von Hand gelöscht.
  }
}

export async function failReview(id: string, message: string): Promise<void> {
  const review = await updateReview(id, (r) => {
    r.status = "failed";
    r.error = message;
  });
  if (review) await removePlaceholder(review);
}

/** Erzeugt eine ID für einen Feedback-Eintrag. */
export function newFeedbackId(): string {
  return randomUUID();
}
