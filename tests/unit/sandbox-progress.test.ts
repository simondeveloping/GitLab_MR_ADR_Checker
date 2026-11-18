import assert from "node:assert/strict";
import { test } from "node:test";
import { SandboxProgressTracker } from "../../src/lib/sandbox-progress";

test("parallel gestartete Regeln zählen erst beim Abschluss, auch mit älterem Sandbox-Image", () => {
  const tracker = new SandboxProgressTracker(new Date().toISOString());
  for (let index = 1; index <= 4; index += 1) {
    tracker.consume("rule_start", { index, of: 4, ruleId: `rule-${index}` });
  }
  assert.equal(tracker.snapshot.percent, 40);
  assert.equal(tracker.snapshot.completedUnits, 0);
  tracker.consume("rule_judged", { ruleId: "rule-4" });
  assert.equal(tracker.snapshot.completedUnits, 1);
  assert.equal(tracker.snapshot.percent, 53);
  tracker.consume("rule_judged", { ruleId: "rule-4" });
  assert.equal(tracker.snapshot.completedUnits, 1);
  tracker.consume("rule_judged", { ruleId: "rule-1" });
  assert.equal(tracker.snapshot.completedUnits, 2);
  assert.equal(tracker.snapshot.percent, 66);
});

test("neue Zähler und bestehende Logmeldungen zählen keine Arbeit doppelt", () => {
  const tracker = new SandboxProgressTracker(new Date().toISOString());
  tracker.consume("phase_progress", { phase: "judging", completed: 0, total: 4 });
  tracker.consume("rule_start", { index: 4, of: 4 });
  tracker.consume("rule_judged", { ruleId: "rule-4" });
  assert.equal(tracker.snapshot.percent, 40);
  tracker.consume("phase_progress", { phase: "judging", completed: 1, total: 4 });
  assert.equal(tracker.snapshot.percent, 53);
  assert.match(tracker.snapshot.message, /1 von 4/);
  tracker.consume("phase_progress", { phase: "judging", completed: 4, total: 4 });
  assert.equal(tracker.snapshot.percent, 92);
  tracker.consume("callback_sent", {});
  tracker.consume("run_summary", {});
  assert.equal(tracker.snapshot.percent, 98);
  tracker.set("exited", 100, "Fertigstellen");
  assert.equal(tracker.snapshot.percent, 99);
});

test("Lernphasen zeigen Teilfortschritt, überspringen leere Phasen und verwerfen ungültige Zähler", () => {
  const tracker = new SandboxProgressTracker(new Date().toISOString());
  tracker.consume("learning_plan", { chunks: 10 });
  tracker.consume("learning_collect_done", { unit: "chunk-7" });
  assert.equal(tracker.snapshot.completedUnits, 1);
  tracker.consume("phase_progress", { phase: "learning_collect", completed: 5, total: 10 });
  assert.equal(tracker.snapshot.percent, 42);
  tracker.consume("phase_progress", { phase: "learning_integration", completed: 1, total: 2 });
  tracker.consume("learning_integration_start", { unit: 2 });
  assert.equal(tracker.snapshot.completedUnits, 1);
  assert.equal(tracker.snapshot.percent, 60);
  tracker.consume("phase_progress", { phase: "learning_verify", completed: 0, total: 0 });
  assert.equal(tracker.snapshot.percent, 82);
  for (const fields of [
    { phase: "__proto__", completed: 1, total: 2 },
    { phase: "judging", completed: -1, total: 2 },
    { phase: "judging", completed: 1, total: NaN },
  ]) assert.equal(tracker.consume("phase_progress", fields), false);
  assert.equal(tracker.snapshot.percent, 82);
});

test("Architektur-Suche und Verifikation haben getrennte Fortschrittsphasen", () => {
  const tracker = new SandboxProgressTracker(new Date().toISOString());
  tracker.consume("phase_progress", { phase: "architecture_search", completed: 1, total: 2 });
  assert.equal(tracker.snapshot.percent, 50);
  tracker.consume("phase_progress", { phase: "architecture_integration", completed: 1, total: 1 });
  assert.equal(tracker.snapshot.percent, 68);
  tracker.consume("phase_progress", { phase: "architecture_verify", completed: 1, total: 2 });
  assert.equal(tracker.snapshot.percent, 80);
  tracker.consume("phase_progress", { phase: "architecture_verify", completed: 2, total: 2 });
  assert.equal(tracker.snapshot.percent, 92);
});
