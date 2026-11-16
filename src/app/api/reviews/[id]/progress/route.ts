import { NextResponse } from "next/server";
import { getReview } from "@/lib/store";
import type { ProgressSnapshot } from "@/lib/reviews";
import { reviewProgressStream } from "@/lib/review-progress-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const review = await getReview(id);
  if (!review) {
    return NextResponse.json({ error: "Review nicht gefunden." }, { status: 404 });
  }

  if (request.headers.get("accept")?.includes("text/event-stream")) {
    return new Response(reviewProgressStream(review, request.signal), {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, no-transform",
        "X-Accel-Buffering": "no",
        Vary: "Accept",
      },
    });
  }

  return NextResponse.json(
    {
      status: review.status,
      progress: review.sandboxProgress,
    } satisfies ProgressSnapshot,
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
        "Surrogate-Control": "no-store",
        Vary: "Accept",
      },
    },
  );
}
