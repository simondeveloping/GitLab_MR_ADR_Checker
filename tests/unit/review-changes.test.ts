import assert from "node:assert/strict";
import { test } from "node:test";
import { chunkReviewDiff, parseReviewDiff } from "../../sandbox/src/review-diff";
import { reviewAnchor, reviewChanges, reviewChunkChanges } from "../../sandbox/src/review-changes";

test("Kandidaten müssen in genau ihrem Diffteil liegen, auch bei umbenannten Dateien und Löschungen", () => {
  const files = parseReviewDiff("diff --git a/old.ts b/new.ts\n--- a/old.ts\n+++ b/new.ts\n@@ -1,2 +1,2 @@\n-oldOne\n+newOne\n context\n@@ -100 +100 @@\n-oldTwo\n+newTwo\n");
  const chunks = chunkReviewDiff(files, 160);
  assert.ok(chunks.length >= 2);
  const first = reviewChunkChanges(chunks[0]);
  assert.ok(reviewAnchor({ path: "new.ts", line: 1 }, first));
  assert.ok(reviewAnchor({ path: "old.ts", line: 1, side: "old" }, first));
  assert.equal(reviewAnchor({ path: "new.ts", line: 100 }, first), null);
  assert.equal(reviewAnchor({ path: "new.ts", line: 2 }, first), null);
  assert.equal(reviewAnchor({ path: "new.ts", line: 1, side: "old" }, first), null);
  assert.equal(reviewAnchor({ path: "new.ts", line: 1, side: "unknown" }, first), null);
  assert.ok(reviewAnchor({ path: "new.ts", line: 100 }, reviewChanges(files)), "Integration darf den gesamten MR verwenden");
});
