import assert from "node:assert/strict";
import { test } from "node:test";
import { chunkReviewDiff, parseReviewDiff } from "../../sandbox/src/review-diff";
import { learningIntegrationReason } from "../../sandbox/src/learning-policy";

const localSignal = { incomplete: false, integrationNeeded: false, interfaces: [], openQuestions: [], relatedPaths: [] };

test("lokale Einsparung bleibt konservativ bei sichtbaren Verträgen, Konfiguration und großer Änderung", () => {
  const run = (path: string, changed: string) => {
    const files = parseReviewDiff(`diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n-old\n+${changed}\n`);
    return learningIntegrationReason(files, chunkReviewDiff(files, 32_000), [localSignal], "auto");
  };
  assert.equal(run("src/local.ts", "const index = 0;"), "local_complete");
  assert.equal(run("src/local.ts", "export const index = 0;"), "interfaces");
  assert.equal(run("src/local.ts", "fetch('/api');"), "interfaces");
  assert.equal(run("src/config.ts", "const index = 0;"), "interfaces");
  assert.equal(run("settings.yaml", "enabled: true"), "interfaces");
  assert.equal(run("src/local.ts", `const text = '${"x".repeat(9000)}';`), "broad_change");
});

test("neue, umbenannte und entfernte Dateien erhalten auch ohne gemeldete Schnittstellen eine Integration", () => {
  for (const patch of [
    "--- /dev/null\n+++ b/new.ts\n@@ -0,0 +1 @@\n+const value = 1;",
    "--- a/old.ts\n+++ b/new.ts\n@@ -1 +1 @@\n-const value = 0;\n+const value = 1;",
    "--- a/old.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-const value = 0;",
  ]) {
    const files = parseReviewDiff(`diff --git a/old.ts b/new.ts\n${patch}\n`);
    assert.equal(learningIntegrationReason(files, chunkReviewDiff(files, 32_000), [localSignal], "auto"), "interfaces");
  }
});
