import { NextResponse } from "next/server";
import { getReview } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params;
  const review = await getReview(id);
  if (!review) {
    return NextResponse.json({ error: "Review nicht gefunden." }, { status: 404 });
  }

  return NextResponse.json(
    {
      status: review.status,
      progress: review.sandboxProgress,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
        "Surrogate-Control": "no-store",
      },
    },
  );
}
