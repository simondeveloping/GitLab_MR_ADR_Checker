/**
 * Rückweg aus der Sandbox (Abschnitt 7.2.5).
 *
 * Ein Skript in der Sandbox sammelt die Einzelantworten ein und schickt sie
 * gebündelt hierher, bevor der Container beendet und gelöscht wird. Das
 * Backend gruppiert die eingegangenen Befunde nach dem ADR, aus dem ihre Regel
 * stammt, erzeugt daraus den Kommentartext und platziert ihn am Merge Request.
 */

import { NextResponse } from "next/server";
import { bearerToken, secretMatches } from "@/lib/auth";
import { removePlaceholder } from "@/lib/orchestrator";
import { publishFindings } from "@/lib/publish";
import { getReview, updateReview } from "@/lib/store";
import type { SandboxResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params;
  const review = await getReview(id);
  if (!review) {
    return NextResponse.json({ error: "unknown review" }, { status: 404 });
  }

  const bearer = bearerToken(request.headers.get("authorization"));
  if (!secretMatches(bearer, review.callbackToken)) {
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }

  if (review.status === "completed") {
    // Ein zweiter Callback zum selben Review würde die Kommentare doppeln.
    return NextResponse.json({ status: "already completed" });
  }

  let result: SandboxResult;
  try {
    result = (await request.json()) as SandboxResult;
  } catch {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const withResult = await updateReview(id, (r) => {
    r.result = result;
  });
  if (!withResult) {
    return NextResponse.json({ error: "unknown review" }, { status: 404 });
  }

  try {
    const published = await publishFindings(withResult);
    await updateReview(id, (r) => {
      r.status = "completed";
      r.publishedComments = published.published;
      r.summaryDiscussionId = published.summaryDiscussionId;
    });
    await removePlaceholder(withResult);
    return NextResponse.json({ status: "ok", reported: published.reported });
  } catch (error) {
    // Das Ergebnis ist bereits gespeichert; nur die Zustellung ist gescheitert.
    await updateReview(id, (r) => {
      r.status = "failed";
      r.error = `Befunde konnten nicht zugestellt werden: ${String(error)}`;
    });
    await removePlaceholder(withResult);
    return NextResponse.json({ error: "publish failed" }, { status: 500 });
  }
}
