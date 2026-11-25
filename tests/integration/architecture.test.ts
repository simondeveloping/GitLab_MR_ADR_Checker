import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { chunkReviewDiff, parseReviewDiff } from "../../sandbox/src/review-diff";

let directory: string;
let requests: Array<{ messages: Array<{ role: string; content: string }> }> = [];
let mode: "valid" | "unread" | "no-suggestion" | "same-line" | "duplicate" | "integration" | "deletion" | "empty" | "rejected" | "inconclusive" | "many" | "bad-dedup" = "valid";
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
  } else if (system.includes("zusaetzliche Verstosskandidaten")) {
    value = { candidates: mode === "integration" ? [
      { rule_id: "r1", path: "other.ts", line: 1, hypothesis: "Vertrag ueber Dateien hinweg verletzt" },
      { rule_id: "r1", path: "src.ts", line: 1, hypothesis: "Altlast" },
    ] : [] };
  } else if (system.includes("Vergleiche bestaetigte Verstoesse")) {
    const { incoming } = JSON.parse(parsed.messages[1].content);
    value = { duplicates: mode === "duplicate" ? [{ id: incoming[1].id, duplicate_of: incoming[0].id }] :
      mode === "bad-dedup" ? [{ id: incoming[1].id, duplicate_of: "unknown" }] : [] };
  } else if (system.includes("moegliche Verstoesse")) {
    value = { candidates: ["integration", "empty"].includes(mode) ? [] : ["many", "bad-dedup"].includes(mode)
      ? Array.from({ length: 10 }, (_, index) => ({ rule_id: "r1", path: "src.ts", line: 2, hypothesis: `Ursache ${index}` })) : mode === "deletion" ? [
      { rule_id: "r1", path: "removed.ts", line: 1, side: "old", hypothesis: "Validierung entfernt" },
    ] : [
      { rule_id: "r1", path: "src.ts", line: 2, hypothesis: "direkter Widerspruch" },
      ...(["same-line", "duplicate"].includes(mode) ? [
        { rule_id: "r1", path: "src.ts", line: 2, hypothesis: "andere Ursache" },
        { rule_id: "r1", path: "src.ts", line: 2, hypothesis: "direkter Widerspruch" },
      ] : []),
      { rule_id: "r2", path: "src.ts", line: 2, hypothesis: "anderer Widerspruch" },
    ] };
  } else if (system.includes("Pruefe genau einen")) {
    if (mode === "rejected") value = { status: "rejected", reason: "Gegenbeleg" };
    else if (mode === "inconclusive") value = { status: "inconclusive", reason: "Deployment-Konfiguration fehlt." };
    else if (mode === "deletion" && !parsed.messages.some((message) => message.role === "tool")) {
      tools = [{ id: "read-current", type: "function", function: { name: "read_file", arguments: JSON.stringify({ path: "src.ts", start_line: 1, end_line: 2 }) } }];
    } else if (!parsed.messages.some((message) => message.role === "tool" || message.content?.startsWith("Automatisch mit read_file"))) {
      const candidate = JSON.parse(/Unbestaetigter Kandidat: ([^\n]+)/.exec(parsed.messages[1].content)![1]) as { path: string; line: number };
      tools = [{ id: "read", type: "function", function: { name: "read_file", arguments: JSON.stringify({ path: candidate.path, start_line: candidate.line, end_line: candidate.line }) } }];
    } else {
      const candidate = JSON.parse(/Unbestaetigter Kandidat: ([^\n]+)/.exec(parsed.messages[1].content)![1]) as { path: string; line: number; hypothesis: string };
      value = { status: "confirmed", rationale: candidate.hypothesis, consequence: "Falscher Wert.",
        suggestion: mode === "no-suggestion" ? "" : `Korrigiere ${candidate.hypothesis}.`, required_paths: [],
        evidence: [{ path: candidate.path, start_line: mode === "unread" ? 999 : candidate.line,
          end_line: mode === "unread" ? 999 : candidate.line, why: "geänderte Stelle", ...(mode === "deletion" ? { revision: "base" } : {}) },
          ...(mode === "deletion" ? [{ path: "src.ts", start_line: 2, end_line: 2, why: "Aktueller Aufrufer" }] : [])] };
    }
  } else throw new Error("unbekannter Prompt");
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify({ choices: [{ finish_reason: tools ? "tool_calls" : "stop", message: { content: tools ? null : JSON.stringify(value), ...(tools ? { tool_calls: tools } : {}) } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
});

before(async () => {
  directory = await mkdtemp("/tmp/opencode/architecture-test-");
  await writeFile(join(directory, "src.ts"), "old value\nnew value\n");
  await writeFile(join(directory, "other.ts"), "other value\n");
  await writeFile(join(directory, "removed.ts"), "validate(input);\n");
  execFileSync("git", ["init", "--quiet"], { cwd: directory });
  execFileSync("git", ["add", "."], { cwd: directory });
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.test", "commit", "--quiet", "-m", "base"], { cwd: directory });
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: directory, encoding: "utf8" }).trim();
  await rm(join(directory, "removed.ts"));
  await writeFile(join(directory, "mr_diff.patch"), "diff --git a/src.ts b/src.ts\n--- a/src.ts\n+++ b/src.ts\n@@ -1,1 +1,2 @@\n old value\n+new value\n");
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  Object.assign(process.env, { REVIEW_ID: "architecture-test", REPO_URL: "https://example.test/repo", MR_SHA: "test",
    MR_TARGET_BRANCH: "main", CALLBACK_URL: "http://example.test/callback", CALLBACK_TOKEN: "test",
    LLM_BASE_URL: `http://127.0.0.1:${address.port}`, LLM_API_KEY: "test", REPO_DIR: directory,
    BUDGET_SEARCH_ROUNDS: "2", BUDGET_FILE_READS: "3", JUDGING_CONCURRENCY: "2" });
  const { setBaseSha } = await import("../../sandbox/src/tools");
  setBaseSha(sha);
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
  assert.equal(requests.filter((request) => request.messages[0].content.includes("Pruefe genau einen")).length, 2,
    "vorgeladene Originalstellen sparen je Kandidat einen Modell-Turn");
});

test("reine Löschungen erhalten Basisbelege, aktuelle Gegenprüfung und alten Inline-Anker", async () => {
  const { reviewArchitecture, architectureVerification } = await import("../../sandbox/src/architecture");
  const rule = { id: "r1", text: "Validiere alle Eingaben.", adrFile: "r1.md", adrTitle: "Validierung", origin: "project" as const };
  const original = "diff --git a/src.ts b/src.ts\n--- a/src.ts\n+++ b/src.ts\n@@ -1,1 +1,2 @@\n old value\n+new value\n";
  try {
    await writeFile(join(directory, "mr_diff.patch"), "diff --git a/removed.ts b/removed.ts\n--- a/removed.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-validate(input);\n");
    mode = "deletion";
    const result = await reviewArchitecture([rule]);
    assert.equal(result.findings[0].verdict, "NC");
    assert.deepEqual(result.findings[0].anchor, { path: "removed.ts", line: 1, side: "old" });
    assert.match(result.findings[0].evidence[0].snippet!.lines[0], /validate/);
    assert.equal(result.findings[0].evidence[0].revision, "base");
    const candidate = { rule, path: "removed.ts", line: 1, side: "old" as const, hypothesis: "Validierung entfernt", trace: [] };
    const value = { status: "confirmed", rationale: "fehlt", consequence: "falsch", suggestion: "validieren", required_paths: [],
      evidence: [{ path: "removed.ts", start_line: 1, end_line: 1, revision: "base", why: "geloescht" }] };
    assert.equal(architectureVerification(value, candidate, [{ path: "removed.ts", revision: "base", lines: new Map([[1, "validate(input);"]]) }]), null,
      "Basisstand allein reicht nicht als Beweis");
  } finally { await writeFile(join(directory, "mr_diff.patch"), original); }
});

test("CIA unterscheidet abgeschlossene Suche, verworfene Kandidaten und unvollständige Verifikation", async () => {
  const { reviewArchitecture } = await import("../../sandbox/src/architecture");
  const rules = [{ id: "r1", text: "Benutze die korrekte Schnittstelle.", adrFile: "r1.md", adrTitle: "Schnittstellen", origin: "project" as const }];
  mode = "empty";
  assert.equal((await reviewArchitecture(rules)).findings[0].coverage?.status, "no_violation");
  mode = "rejected";
  assert.equal((await reviewArchitecture(rules)).findings[0].coverage?.rejectedCandidates, 1);
  mode = "unread";
  assert.equal((await reviewArchitecture(rules)).findings[0].coverage?.status, "incomplete");
  mode = "inconclusive";
  const missing = (await reviewArchitecture(rules)).findings[0];
  assert.match(missing.rationale, /Deployment-Konfiguration fehlt/);
  assert.equal(missing.budgetExhausted, false);
});

test("zehn bestätigte Ursachen werden in zwei Paketen verglichen; ungültige Referenzen löschen keine Befunde", async () => {
  const { reviewArchitecture } = await import("../../sandbox/src/architecture");
  const rules = [{ id: "r1", text: "Benutze die korrekte Schnittstelle.", adrFile: "r1.md", adrTitle: "Schnittstellen", origin: "project" as const }];
  mode = "many";
  requests = [];
  assert.equal((await reviewArchitecture(rules)).findings.length, 10);
  assert.equal(requests.filter((request) => request.messages[0].content.includes("Vergleiche bestaetigte Verstoesse")).length, 2);
  mode = "bad-dedup";
  const result = await reviewArchitecture(rules);
  assert.equal(result.findings.length, 10);
  assert.ok(result.failures.some((failure) => failure.message.includes("Dublettenreferenz")));
});

test("ungelesene Belege und fehlender Vorschlag führen nicht zu NC", async () => {
  const { reviewArchitecture } = await import("../../sandbox/src/architecture");
  const rules = [{ id: "r1", text: "Benutze die korrekte Schnittstelle.", adrFile: "r1.md", adrTitle: "Schnittstellen", origin: "project" as const }];
  for (const learningExplanation of [false, true]) {
    for (const scenario of ["unread", "no-suggestion"] as const) {
      mode = scenario;
      const result = await reviewArchitecture(rules, learningExplanation);
      assert.deepEqual(result.findings.map((finding) => finding.verdict), ["CIA"]);
      assert.equal(result.failures.length, 1);
    }
  }
});

test("ausführlichere ADR-Erklärungen behalten das Ergebnisformat und ihre begrenzte Länge", async () => {
  const { architectureVerification } = await import("../../sandbox/src/architecture");
  const rule = { id: "r1", text: "Schnittstelle einhalten", adrFile: "adr.md", adrTitle: "Schnittstelle", origin: "project" as const };
  const candidate = { rule, path: "src.ts", line: 2, hypothesis: "Verstoß", trace: [] };
  const excerpts = [{ path: "src.ts", lines: new Map([[2, "new value"]]) }];
  const value = { status: "confirmed", rationale: "a".repeat(1800), consequence: "b".repeat(1800),
    suggestion: "c".repeat(1800), required_paths: [], evidence: [{ path: "src.ts", start_line: 2, end_line: 2, why: "Originalstelle" }] };
  const normal = architectureVerification(value, candidate, excerpts)!;
  const learning = architectureVerification(value, candidate, excerpts, true)!;
  assert.deepEqual(Object.keys(learning), Object.keys(normal));
  assert.deepEqual(learning.evidence, normal.evidence);
  for (const field of ["rationale", "consequence", "suggestion"] as const) {
    assert.equal(normal[field].length, 1200);
    assert.equal(learning[field], value[field]);
    assert.equal(architectureVerification({ ...value, [field]: "x".repeat(3000) }, candidate, excerpts, true)![field].length, 2400);
  }
  assert.equal(architectureVerification({ ...value, required_paths: ["unread.ts"] }, candidate, excerpts, true), null);
  assert.equal(architectureVerification(value, { ...candidate, line: 1 }, excerpts, true), null);
  for (const status of ["rejected", "inconclusive"]) {
    assert.equal(architectureVerification({ ...value, status }, candidate, excerpts, true), null);
  }
});

test("Kandidatenanker muss in der richtigen Datei und Änderungseinheit liegen", async () => {
  const { architectureCandidate } = await import("../../sandbox/src/architecture");
  const rules = [{ id: "r1", text: "Schnittstelle einhalten", adrFile: "adr.md", adrTitle: "Schnittstelle", origin: "project" as const }];
  const chunks = chunkReviewDiff(parseReviewDiff([
    "diff --git a/a.ts b/a.ts", "--- a/a.ts", "+++ b/a.ts", "@@ -1 +1 @@", "-old", "+new",
    "diff --git a/b.ts b/b.ts", "--- a/b.ts", "+++ b/b.ts", "@@ -1 +1 @@", " context", "+change",
  ].join("\n")), 1000);
  const chunk = chunks[0];
  assert.ok(architectureCandidate({ rule_id: "r1", path: "a.ts", line: 1, hypothesis: "verletzt" }, rules, chunk));
  assert.equal(architectureCandidate({ rule_id: "r1", path: "b.ts", line: 1, hypothesis: "verletzt" }, rules, chunk), null);
  assert.equal(architectureCandidate({ rule_id: "fremd", path: "a.ts", line: 1, hypothesis: "verletzt" }, rules, chunk), null);
});

test("verschiedene Ursachen an derselben Zeile werden separat verifiziert und erst dann dedupliziert", async () => {
  const { reviewArchitecture } = await import("../../sandbox/src/architecture");
  const rules = [{ id: "r1", text: "Benutze die korrekte Schnittstelle.", adrFile: "r1.md", adrTitle: "Schnittstellen", origin: "project" as const }];
  for (const [scenario, expected] of [["same-line", 2], ["duplicate", 1]] as const) {
    mode = scenario;
    requests = [];
    const result = await reviewArchitecture(rules);
    assert.equal(requests.filter((request) => request.messages[0].content.includes("Pruefe genau einen") &&
      !request.messages.some((message) => message.role === "tool")).length, 2);
    assert.equal(result.findings.length, expected);
    assert.ok(result.findings.every((finding) => finding.anchor?.path === "src.ts" && finding.anchor.line === 2));
  }
});

test("Integrationssuche findet Kandidaten jenseits eines Diffteils und validiert deren MR-Anker", async () => {
  const { reviewArchitecture } = await import("../../sandbox/src/architecture");
  const { config } = await import("../../sandbox/src/config");
  const oldBudget = config.learningBudget.chunkBytes;
  try {
    config.learningBudget.chunkBytes = 135;
    const patch = "diff --git a/src.ts b/src.ts\n--- a/src.ts\n+++ b/src.ts\n@@ -1,1 +1,2 @@\n old value\n+new value\n" +
      "diff --git a/other.ts b/other.ts\n--- /dev/null\n+++ b/other.ts\n@@ -0,0 +1 @@\n+other value\n";
    assert.equal(chunkReviewDiff(parseReviewDiff(patch), 135).length, 2);
    await writeFile(join(directory, "mr_diff.patch"), patch);
    mode = "integration";
    requests = [];
    const result = await reviewArchitecture([{ id: "r1", text: "Benutze die korrekte Schnittstelle.", adrFile: "r1.md", adrTitle: "Schnittstellen", origin: "project" }]);
    assert.equal(requests.filter((request) => request.messages[0].content.includes("zusaetzliche Verstosskandidaten")).length, 1);
    assert.deepEqual(result.findings.map((finding) => finding.anchor), [{ path: "other.ts", line: 1 }]);
  } finally {
    config.learningBudget.chunkBytes = oldBudget;
    await writeFile(join(directory, "mr_diff.patch"), "diff --git a/src.ts b/src.ts\n--- a/src.ts\n+++ b/src.ts\n@@ -1,1 +1,2 @@\n old value\n+new value\n");
  }
});
