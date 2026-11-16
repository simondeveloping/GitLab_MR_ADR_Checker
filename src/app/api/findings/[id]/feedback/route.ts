import { NextResponse } from "next/server";
import { isRating, recordFeedback } from "@/lib/feedback";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: findingId } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  if (!body || typeof body !== "object" ||
    !("reviewId" in body) || typeof body.reviewId !== "string" || !body.reviewId ||
    !("rating" in body) || !isRating(body.rating) ||
    ("comment" in body && typeof body.comment !== "string")) {
    return NextResponse.json({ error: "reviewId and rating required; comment must be a string" }, { status: 400 });
  }

  const outcome = await recordFeedback(
    body.reviewId,
    findingId,
    body.rating,
    "comment" in body ? body.comment as string : undefined,
  );
  if (typeof outcome === "string") {
    return NextResponse.json({ error: outcome }, { status: 404 });
  }
  return NextResponse.json({ status: "ok", feedback: outcome });
}
