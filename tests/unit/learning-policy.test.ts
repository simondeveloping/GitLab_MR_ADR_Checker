import assert from "node:assert/strict";
import { test } from "node:test";
import { chunkLearningDiff, parseLearningDiff } from "../../sandbox/src/learning-diff";
import { learningAnchor, learningChanges, learningChunkChanges, learningIntegrationReason } from "../../sandbox/src/learning-policy";

const localSignal = { incomplete: false, integrationNeeded: false, interfaces: [], openQuestions: [], relatedPaths: [] };

test("Kandidaten müssen in genau ihrem Diffteil liegen, auch bei umbenannten Dateien und Löschungen", () => {
  const files = parseLearningDiff("diff --git a/old.ts b/new.ts\n--- a/old.ts\n+++ b/new.ts\n@@ -1,2 +1,2 @@\n-oldOne\n+newOne\n context\n@@ -100 +100 @@\n-oldTwo\n+newTwo\n");
  const chunks = chunkLearningDiff(files, 160);
  assert.ok(chunks.length >= 2);
  const first = learningChunkChanges(chunks[0]);
  assert.ok(learningAnchor({ path: "new.ts", line: 1 }, first));
  assert.ok(learningAnchor({ path: "old.ts", line: 1, side: "old" }, first));
  assert.equal(learningAnchor({ path: "new.ts", line: 100 }, first), null);
  assert.equal(learningAnchor({ path: "new.ts", line: 2 }, first), null);
  assert.equal(learningAnchor({ path: "new.ts", line: 1, side: "old" }, first), null);
  assert.equal(learningAnchor({ path: "new.ts", line: 1, side: "unknown" }, first), null);
  assert.ok(learningAnchor({ path: "new.ts", line: 100 }, learningChanges(files)), "Integration darf den gesamten MR verwenden");
});

test("lokale Einsparung bleibt konservativ bei sichtbaren Verträgen, Konfiguration und großer Änderung", () => {
  const run = (path: string, changed: string) => {
    const files = parseLearningDiff(`diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n-old\n+${changed}\n`);
    return learningIntegrationReason(files, chunkLearningDiff(files, 32_000), [localSignal], "auto");
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
    const files = parseLearningDiff(`diff --git a/old.ts b/new.ts\n${patch}\n`);
    assert.equal(learningIntegrationReason(files, chunkLearningDiff(files, 32_000), [localSignal], "auto"), "interfaces");
  }
});
