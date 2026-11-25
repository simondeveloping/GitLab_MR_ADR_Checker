import assert from "node:assert/strict";
import { test } from "node:test";
import { findCommentablePosition } from "../../src/lib/gitlab/publish";
import { createInlineDiscussion } from "../../src/lib/gitlab/client";
import { makeReview } from "../fixtures";

test("bestätigter Anker hat Vorrang vor anderen hinzugefügten Belegzeilen", () => {
  const finding = makeReview().result!.findings[0];
  finding.evidence = [{ path: "src.ts", startLine: 3, endLine: 3 }, { path: "src.ts", startLine: 7, endLine: 7 }];
  finding.anchor = { path: "src.ts", line: 7 };
  const targets = new Map([["src.ts", { newPath: "src.ts", oldPath: "src.ts", newLines: new Set([3, 7]) }]]);
  assert.equal(findCommentablePosition(finding, targets)?.line, 7);
  finding.anchor.line = 8;
  assert.equal(findCommentablePosition(finding, targets), null);
});

test("GitLab erhält bei Löschungen old_line statt new_line", async (t) => {
  const previous = process.env.GITLAB_CONNECTIONS;
  process.env.GITLAB_CONNECTIONS = JSON.stringify([{ host: "https://gitlab.example.test", token: "test" }]);
  let payload: Record<string, unknown> = {};
  t.mock.method(globalThis, "fetch", async (_url: string, options: RequestInit) => {
    payload = JSON.parse(String(options.body));
    return Response.json({ id: "discussion-1" });
  });
  try {
    assert.equal(await createInlineDiscussion(1, 2, "Befund", { base_sha: "base", head_sha: "head", start_sha: "start" },
      { oldPath: "removed.ts", newPath: "removed.ts", oldLine: 7 }, "https://gitlab.example.test/test/repo.git"), "discussion-1");
    const position = payload.position as Record<string, unknown>;
    assert.equal(position.old_line, 7);
    assert.equal(Object.hasOwn(position, "new_line"), false);
  } finally {
    if (previous === undefined) delete process.env.GITLAB_CONNECTIONS; else process.env.GITLAB_CONNECTIONS = previous;
  }
});

test("gelöschte Zeile wird auf alter Diffseite verankert, niemals auf gleich nummerierter neuer Zeile", () => {
  const finding = makeReview().result!.findings[0];
  finding.anchor = { path: "removed.ts", line: 7, side: "old" };
  const target = { newPath: "removed.ts", oldPath: "removed.ts", newLines: new Set([7]), oldLines: new Set([6, 7]) };
  const targets = new Map([["removed.ts", target]]);
  assert.equal(findCommentablePosition(finding, targets)?.side, "old");
  target.oldLines.delete(7);
  assert.equal(findCommentablePosition(finding, targets), null);
});
