import assert from "node:assert/strict";
import { test } from "node:test";
import { addedLinesByPath, candidateDiff, chunkReviewDiff, parseReviewDiff } from "../../sandbox/src/review-diff";

test("Diff-Parser erhält Originalzeilen, Löschungen, Renames und Git-quotierte Pfade", () => {
  const files = parseReviewDiff([
    "diff --git a/old.ts b/new.ts", "--- a/old.ts", "+++ b/new.ts", "@@ -10,3 +20,4 @@",
    " same", "-removed", "+replacement", "+++ b/not-a-header.ts", "+new", " last",
    "diff --git a/deleted.ts b/deleted.ts", "--- a/deleted.ts", "+++ /dev/null", "@@ -1 +0,0 @@", "-deleted",
    'diff --git "a/\\303\\244.ts" "b/\\303\\244.ts"', "--- /dev/null", '+++ "b/\\303\\244.ts"', "@@ -0,0 +1 @@", "+unicode",
  ].join("\n"));
  assert.deepEqual(files.map((file) => [file.oldPath, file.path]), [["old.ts", "new.ts"], ["deleted.ts", "deleted.ts"], ["", "ä.ts"]]);
  const lines = addedLinesByPath(files);
  assert.deepEqual([...lines.get("new.ts")!], [21, 22, 23]);
  assert.deepEqual([...lines.get("deleted.ts")!], []);
  assert.deepEqual([...lines.get("ä.ts")!], [1]);
  assert.match(candidateDiff(files, "new.ts", 22), /alt:- neu:22 \| \+\+\+ b\/not-a-header.ts/);
});

test("großer Hunk wird vollständig und ohne doppelte hinzugefügte Zeilen aufgeteilt", () => {
  const count = 4000;
  const patch = `diff --git a/large.ts b/large.ts\n--- /dev/null\n+++ b/large.ts\n@@ -0,0 +1,${count} @@\n` +
    Array.from({ length: count }, (_, index) => `+line${index} ${"x".repeat(80)}`).join("\n");
  assert.ok(Buffer.byteLength(patch) > 200_000);
  const chunks = chunkReviewDiff(parseReviewDiff(patch), 8_000);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => Buffer.byteLength(chunk.diff) <= 8_000 && !chunk.oversized));
  const added = chunks.flatMap((chunk) => [...chunk.diff.matchAll(/alt:- neu:(\d+) \| \+/g)].map((match) => Number(match[1])));
  assert.deepEqual(added, Array.from({ length: count }, (_, index) => index + 1));
});

test("überlange Einzelzeile wird markiert und verdeckt keine folgenden Änderungen", () => {
  const files = parseReviewDiff("diff --git a/f.ts b/f.ts\n--- /dev/null\n+++ b/f.ts\n@@ -0,0 +1,2 @@\n+" + "x".repeat(2000) + "\n+short\n");
  const chunks = chunkReviewDiff(files, 500);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].oversized, true);
  assert.equal(chunks[1].oversized, false);
  assert.match(chunks[1].diff, /neu:2 \| \+short/);
});
