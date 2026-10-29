/**
 * Feedback-Mechanismus (FA-15, Abschnitt 7.5).
 *
 * Die Rückmeldung wird unmittelbar am einzelnen Review-Befund erhoben und
 * nicht als Gesamturteil über den Review. Der Zuschnitt folgt einer
 * wiederkehrenden Beobachtung dieser Arbeit: Wer ein fremdes Urteil samt
 * Begründung vorgelegt bekommt, verankert sich an dieser Begründung, statt
 * unabhängig zu prüfen. Ein Gesamturteil würde denselben Effekt bei den
 * Entwickelnden erzeugen, weshalb die Bewertung an der einzelnen, belegten
 * Fundstelle ansetzt.
 *
 * GET nimmt die Bewertung über ein natives HTML-Formular entgegen und leitet
 * zurück zum bewerteten Befund; so funktioniert die Rückmeldung auch ohne
 * clientseitiges JavaScript.
 */

import { NextResponse } from "next/server";
import { getReview, updateReview } from "@/lib/store";
import type { FeedbackEntry } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseRating(value: string | null): FeedbackEntry["rating"] | null {
  return value === "up" || value === "down" ? value : null;
}

async function record(
  reviewId: string,
  findingId: string,
  rating: FeedbackEntry["rating"],
  comment?: string,
): Promise<"ok" | "unknown review" | "unknown finding"> {
  const review = await getReview(reviewId);
  if (!review) return "unknown review";

  const exists = review.result?.findings.some((f) => f.id === findingId);
  if (!exists) return "unknown finding";

  await updateReview(reviewId, (r) => {
    // Eine Person darf ihre Meinung ändern; der letzte Eintrag je Befund gilt.
    r.feedback = (r.feedback ?? []).filter((entry) => entry.findingId !== findingId);
    r.feedback.push({
      findingId,
      rating,
      comment: comment?.trim() || undefined,
      createdAt: new Date().toISOString(),
    });
  });

  return "ok";
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: findingId } = await context.params;
  const url = new URL(request.url);
  const reviewId = url.searchParams.get("review");
  const rating = parseRating(url.searchParams.get("rating"));

  if (!reviewId || !rating) {
    return NextResponse.json({ error: "review and rating required" }, {
      status: 400,
    });
  }

  const outcome = await record(reviewId, findingId, rating);
  if (outcome !== "ok") {
    return NextResponse.json({ error: outcome }, { status: 404 });
  }

  // Zurück auf die Detailseite, damit die Rückmeldung sichtbar quittiert wird.
  return NextResponse.redirect(
    new URL(`/reviews/${reviewId}#${findingId}`, url.origin),
    303,
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: findingId } = await context.params;

  let body: { reviewId?: string; rating?: string; comment?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const rating = parseRating(body.rating ?? null);
  if (!body.reviewId || !rating) {
    return NextResponse.json({ error: "reviewId and rating required" }, {
      status: 400,
    });
  }

  const outcome = await record(body.reviewId, findingId, rating, body.comment);
  if (outcome !== "ok") {
    return NextResponse.json({ error: outcome }, { status: 404 });
  }

  return NextResponse.json({ status: "ok" });
}
