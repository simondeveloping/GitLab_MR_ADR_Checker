import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { chunkLearningDiff, parseLearningDiff } from "../../sandbox/src/learning-diff";

let directory: string;
let requests: Array<{ messages: Array<{ role: string; content: string }> }> = [];
let mode: "valid" | "unread" | "no-suggestion" = "valid";
const server = createServer(async (request, response) => {
  let body = "";
  for await (const part of request) body += part;
  const parsed = JSON.parse(body) as { messages: Array<{ role: string; content: string }> };
  requests.push(parsed);
  const system = parsed.messages[0].content;
  let value: unknown;
  let tools: unknown;
  if (system.includes("Ordne Architekturregeln")) {
    value = { selected: parsed.messages[1].content.includes("1: [") ? [0, 1] : [0] };
  } else if (system.includes("moegliche Verstoesse")) {
    value = { candidates: [
      { rule_id: "r1", path: "src.ts", line: 2, hypothesis: "direkter Widerspruch" },
      { rule_id: "r2", path: "src.ts", line: 2, hypothesis: "anderer Widerspruch" },
      { rule_id: "r1", path: "src.ts", line: 1, hypothesis: "Altlast" },
    ] };
  } else if (system.includes("Pruefe genau einen")) {
    if (!parsed.messages.some((message) => message.role === "tool")) {
      tools = [{ id: "read", type: "function", function: { name: "read_file", arguments: JSON.stringify({ path: "src.ts", start_line: 2, end_line: 2 }) } }];
    } else {
      const candidate = JSON.parse(/Unbestaetigter Kandidat: ([^\n]+)/.exec(parsed.messages[1].content)![1]) as { path: string };
      value = { status: "confirmed", rationale: "Die Regel wird hier verletzt.", consequence: "Falscher Wert.",
        suggestion: mode === "no-suggestion" ? "" : "Setze die korrekte Schnittstelle ein.", required_paths: [],
        evidence: [{ path: candidate.path, start_line: mode === "unread" ? 1 : 2, end_line: mode === "unread" ? 1 : 2, why: "geänderte Stelle" }] };
    }
  } else throw new Error("unbekannter Prompt");
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify({ choices: [{ finish_reason: tools ? "tool_calls" : "stop", message: { content: tools ? null : JSON.stringify(value), ...(tools ? { tool_calls: tools } : {}) } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
});

before(async () => {
  directory = await mkdtemp("/tmp/opencode/architecture-test-");
  await writeFile(join(directory, "src.ts"), "old value\nnew value\n");
  await writeFile(join(directory, "mr_diff.patch"), "diff --git a/src.ts b/src.ts\n--- a/src.ts\n+++ b/src.ts\n@@ -1,1 +1,2 @@\n old value\n+new value\n");
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  Object.assign(process.env, { REVIEW_ID: "architecture-test", REPO_URL: "https://example.test/repo", MR_SHA: "test",
    MR_TARGET_BRANCH: "main", CALLBACK_URL: "http://example.test/callback", CALLBACK_TOKEN: "test",
    LLM_BASE_URL: `http://127.0.0.1:${address.port}`, LLM_API_KEY: "test", REPO_DIR: directory,
    BUDGET_SEARCH_ROUNDS: "2", BUDGET_FILE_READS: "2", JUDGING_CONCURRENCY: "2" });
});
after(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await rm(directory, { recursive: true, force: true });
});

test("gemeinsame Suche prüft mehrere Regeln, verwirft Altlasten und belegt NC mit Originalzeilen", async () => {
  const { reviewArchitecture } = await import("../../sandbox/src/architecture");
  const rules = ["r1", "r2"].map((id) => ({ id, text: "Benutze die korrekte Schnittstelle.", adrFile: `${id}.md`, adrTitle: "Schnittstellen", origin: "project" as const }));
  requests = [];
  mode = "valid";
  const result = await reviewArchitecture(rules);
  assert.equal(requests.filter((request) => request.messages[0].content.includes("moegliche Verstoesse")).length, 1);
  assert.equal(result.findings.length, 2);
  assert.ok(result.findings.every((finding) => finding.verdict === "NC" && finding.evidence[0].startLine === 2 && finding.suggestion));
});

test("ungelesene Belege und fehlender Vorschlag führen nicht zu NC", async () => {
  const { reviewArchitecture } = await import("../../sandbox/src/architecture");
  const rules = [{ id: "r1", text: "Benutze die korrekte Schnittstelle.", adrFile: "r1.md", adrTitle: "Schnittstellen", origin: "project" as const }];
  for (const scenario of ["unread", "no-suggestion"] as const) {
    mode = scenario;
    const result = await reviewArchitecture(rules);
    assert.deepEqual(result.findings.map((finding) => finding.verdict), ["CIA"]);
    assert.equal(result.failures.length, 1);
  }
});

test("Kandidatenanker muss in der richtigen Datei und Änderungseinheit liegen", async () => {
  const { architectureCandidate } = await import("../../sandbox/src/architecture");
  const rules = [{ id: "r1", text: "Schnittstelle einhalten", adrFile: "adr.md", adrTitle: "Schnittstelle", origin: "project" as const }];
  const chunks = chunkLearningDiff(parseLearningDiff([
    "diff --git a/a.ts b/a.ts", "--- a/a.ts", "+++ b/a.ts", "@@ -1 +1 @@", "-old", "+new",
    "diff --git a/b.ts b/b.ts", "--- a/b.ts", "+++ b/b.ts", "@@ -1 +1 @@", " context", "+change",
  ].join("\n")), 1000);
  const chunk = chunks[0];
  assert.ok(architectureCandidate({ rule_id: "r1", path: "a.ts", line: 1, hypothesis: "verletzt" }, rules, chunk));
  assert.equal(architectureCandidate({ rule_id: "r1", path: "b.ts", line: 1, hypothesis: "verletzt" }, rules, chunk), null);
  assert.equal(architectureCandidate({ rule_id: "fremd", path: "a.ts", line: 1, hypothesis: "verletzt" }, rules, chunk), null);
});
