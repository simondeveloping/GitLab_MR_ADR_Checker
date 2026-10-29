/**
 * Webhook-Endpunkt (Abschnitt 7.2.1).
 *
 * Den Anstoß gibt GitLab selbst über einen Webhook auf
 * Merge-Request-Ereignisse. Der Endpunkt prüft zuerst das mitgesandte
 * Geheimnis, damit er nicht von außen als Auslöser missbraucht werden kann,
 * und filtert anschließend auf den Ereignistyp, sodass nur neu geöffnete
 * Merge Requests einen Review auslösen.
 *
 * Der naheliegende Alternativweg wäre ein zusätzlicher Job in der
 * CI/CD-Pipeline gewesen. Ein Prüfvorgang mit mehreren Modellaufrufen je
 * Regel würde diese jedoch für Minuten belegen. Der Webhook koppelt den
 * Review vollständig ab, sodass beide nebeneinander laufen (FA-12, NFA-9).
 */

import { NextResponse } from "next/server";
import { secretMatches } from "@/lib/auth";
import { env } from "@/lib/env";
import { createReview, startReview } from "@/lib/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface MergeRequestEvent {
  object_kind?: string;
  event_type?: string;
  project?: {
    id?: number;
    git_http_url?: string;
    http_url?: string;
    web_url?: string;
  };
  object_attributes?: {
    iid?: number;
    action?: string;
    oldrev?: string;
    state?: string;
    work_in_progress?: boolean;
    draft?: boolean;
  };
}

/**
 * Nur ein neu geöffneter Merge Request löst aus. Updates, Reopens, Close- und
 * Merge-Ereignisse werden ignoriert, damit ein MR nicht mehrfach Sandboxen
 * startet.
 */
function shouldReview(event: MergeRequestEvent): boolean {
  const attributes = event.object_attributes;
  if (!attributes) return false;
  if (attributes.state === "closed" || attributes.state === "merged") {
    return false;
  }
  // Entwürfe sind noch nicht zur Prüfung gestellt.
  if (attributes.draft || attributes.work_in_progress) return false;

  return attributes.action === "open";
}

export async function POST(request: Request): Promise<NextResponse> {
  const provided = request.headers.get("x-gitlab-token");
  if (!secretMatches(provided, env.webhookSecret)) {
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }

  let event: MergeRequestEvent;
  try {
    event = (await request.json()) as MergeRequestEvent;
  } catch {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  if (event.object_kind !== "merge_request") {
    return NextResponse.json({ status: "ignored", reason: "event kind" });
  }
  if (!shouldReview(event)) {
    return NextResponse.json({ status: "ignored", reason: "action" });
  }

  const projectId = event.project?.id;
  const mrIid = event.object_attributes?.iid;
  const repoUrl =
    event.project?.git_http_url ??
    event.project?.http_url ??
    (event.project?.web_url ? `${event.project.web_url}.git` : undefined);
  if (!projectId || !mrIid || !repoUrl) {
    return NextResponse.json({ error: "incomplete payload" }, { status: 400 });
  }

  const review = await createReview(projectId, mrIid, repoUrl);

  // Bewusst ohne await: GitLab erwartet eine schnelle Quittung, der Prüflauf
  // dauert Minuten.
  void startReview(review).catch(() => undefined);

  return NextResponse.json(
    { status: "accepted", reviewId: review.id },
    { status: 202 },
  );
}
