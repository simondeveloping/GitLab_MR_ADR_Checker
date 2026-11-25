import { createHash } from "node:crypto";
import { bearerToken, secretMatches } from "@/lib/auth";
import { accessRuleCache, RULE_CACHE_ENTRY_BYTES, validCachedRules } from "@/lib/reviews/rule-cache";
import { getReview } from "@/lib/reviews/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const review = await getReview(id);
  if (!review) return Response.json({ error: "unknown review" }, { status: 404 });
  if (!secretMatches(bearerToken(request.headers.get("authorization")), review.callbackToken)) {
    return Response.json({ error: "invalid token" }, { status: 401 });
  }
  if (review.status !== "running") return Response.json({ error: "review not running" }, { status: 409 });
  // Auch ohne Content-Length begrenzt lesen; der Endpunkt akzeptiert nur Regelpakete.
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: "missing payload" }, { status: 400 });
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > RULE_CACHE_ENTRY_BYTES + 1024) {
        await reader.cancel();
        return Response.json({ error: "payload too large" }, { status: 413 });
      }
      parts.push(value);
    }
    const payload = JSON.parse(Buffer.concat(parts).toString("utf8"));
    if (!payload || !/^[a-f0-9]{64}$/.test(payload.key) ||
      (payload.rules !== undefined && !validCachedRules(payload.rules))) {
      return Response.json({ error: "invalid payload" }, { status: 400 });
    }
    const repo = new URL(review.mr.repoUrl);
    repo.username = repo.password = repo.search = repo.hash = "";
    const scope = createHash("sha256").update(repo.toString()).digest("hex");
    const rules = await accessRuleCache(scope, payload.key, payload.rules);
    return Response.json({ rules }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "invalid payload" }, { status: 400 });
  } finally { reader.releaseLock(); }
}
