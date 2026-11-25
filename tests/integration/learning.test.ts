import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage } from "node:http";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

interface RequestBody {
  model: string;
  messages: Array<{ role: string; content: string }>;
  tools?: Array<{ function: { name: string } }>;
}

let directory: string;
let handler: (body: RequestBody) => unknown;
const requests: RequestBody[] = [];
const reply = (value: unknown) => ({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }], usage: { prompt_tokens: 100, completion_tokens: 20 } });
const toolReply = (calls: Array<{ path: string; start_line?: number; end_line?: number; revision?: "base" }>) => ({ choices: [{ finish_reason: "tool_calls", message: {
  content: null, tool_calls: calls.map((args, index) => ({ id: `call-${index}`, type: "function", function: { name: "read_file", arguments: JSON.stringify(args) } })),
} }], usage: { prompt_tokens: 100, completion_tokens: 20 } });
async function requestBody(request: IncomingMessage): Promise<RequestBody> {
  let data = "";
  for await (const chunk of request) data += chunk;
  return JSON.parse(data);
}
const server = createServer(async (request, response) => {
  try {
    const body = await requestBody(request);
    requests.push(body);
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify(handler(body)));
  } catch (error) {
    response.writeHead(400);
    response.end(String(error));
  }
});

before(async () => {
  directory = await mkdtemp("/tmp/opencode/learning-test-");
  await mkdir(join(directory, "src"));
  await mkdir(join(directory, "lib"));
  await writeFile(join(directory, "lib/unchanged.ts"), "export const response = { userId: 1 };\n");
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  Object.assign(process.env, {
    REVIEW_ID: "learning-test", REPO_URL: "https://example.test/repo", MR_SHA: "test", MR_TARGET_BRANCH: "main",
    CALLBACK_URL: "http://example.test/callback", CALLBACK_TOKEN: "test", LLM_BASE_URL: `http://127.0.0.1:${address.port}`,
    LLM_API_KEY: "test", LLM_MODEL: "test", REPO_DIR: directory, LEARNING_CHUNK_BYTES: "16000",
    LEARNING_CONCURRENCY: "2", LEARNING_BUDGET_SEARCH_ROUNDS: "2", LEARNING_BUDGET_FILE_READS: "3",
    LEARNING_MODEL: "learning-search", LEARNING_VERIFY_MODEL: "learning-verify", LEARNING_DEDUP_MODEL: "learning-dedup",
    LLM_VERIFY_MODEL: "adr-verify", LLM_FAST_MODEL: "adr-fast", LEARNING_INTEGRATION_MODE: "auto",
  });
});
after(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await rm(directory, { recursive: true, force: true });
});

test("mehrstufiger großer MR: Repo-Belege, Integration, Verifikation, Dubletten und isolierte Fehler", async (t) => {
  requests.length = 0;
  const count = 5;
  const patches: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const source = Array.from({ length: 500 }, (_, line) => `const line${line} = '${"x".repeat(100)}';`);
    await writeFile(join(directory, `src/file${index}.ts`), source.join("\n"));
    patches.push(`diff --git a/src/file${index}.ts b/src/file${index}.ts\n--- /dev/null\n+++ b/src/file${index}.ts\n@@ -0,0 +1,500 @@\n` + source.map((line) => `+${line}`).join("\n"));
  }
  const patch = patches.join("\n");
  assert.ok(Buffer.byteLength(patch) > 200_000);
  await writeFile(join(directory, "mr_diff.patch"), patch);
  const candidate = (title: string, path = "src/file0.ts", line = 1) => ({ path, line, title, hypothesis: title, check: "API-Vertrag nachlesen", related_paths: ["lib/unchanged.ts"] });
  handler = (body) => {
    const system = body.messages[0].content;
    const input = body.messages[1].content;
    if (system.includes("PHASE: SAMMELN")) {
      if (input.includes("Einheit chunk-2.")) throw new Error("isolierter Sammelfehler");
      const first = input.includes("Einheit chunk-1.");
      return reply({ summary: "Client liest Antwortfeld", interfaces: ["response.userId aus lib/unchanged.ts"], open_questions: [], integration_needed: true, candidates: first ? [
        candidate("valid"), candidate("duplicate"), candidate("missing-evidence"), candidate("rejected"), candidate("wrong-anchor", "src/file0.ts", 9999),
        candidate("wrong-chunk", "src/file0.ts", 500),
      ] : [] });
    }
    if (system.includes("PHASE: INTEGRATION")) {
      assert.match(input, /response.userId/);
      if (!body.messages.some((message) => message.role === "tool")) return toolReply([{ path: "lib/unchanged.ts" }]);
      return reply({ candidates: [candidate("integration", "src/file4.ts", 1)] });
    }
    if (system.includes("PHASE: VERIFIZIEREN")) {
      const value = JSON.parse(input.split("\n")[1]);
      if (value.title === "rejected") return reply({ status: "rejected", reason: "Gegenbeleg gefunden" });
      if (!body.messages.some((message) => message.role === "tool")) {
        assert.ok(body.messages.some((message) => message.content?.startsWith("Automatisch mit read_file")));
        return toolReply([{ path: "lib/unchanged.ts", start_line: 1, end_line: 1 }]);
      }
      return reply({ status: "confirmed", title: value.title, why: value.title, consequence: "Falsches Antwortfeld", suggestion: "userId verwenden",
        required_paths: value.title === "missing-evidence" ? ["lib/not-read.ts"] : ["lib/unchanged.ts"],
        evidence: [{ path: value.path, start_line: value.line, end_line: value.line, why: "Aufruf" },
          { path: "lib/unchanged.ts", start_line: 1, end_line: 1, why: "Antwortvertrag" }],
      });
    }
    if (system.includes("Vergleiche bestaetigte")) {
      const value = JSON.parse(input);
      const valid = value.incoming.find((item: { title: string }) => item.title === "valid");
      const duplicate = value.incoming.find((item: { title: string }) => item.title === "duplicate");
      return reply({ duplicates: valid && duplicate ? [{ id: duplicate.id, duplicate_of: valid.id }] : [] });
    }
    throw new Error("Unerwarteter zusätzlicher Modellaufruf");
  };
  const { reviewForLearning } = await import("../../sandbox/src/learning");
  const { log } = await import("../../sandbox/src/trace");
  const progress: Array<{ phase: string; completed: number; total: number }> = [];
  t.mock.method(log, "info", (event: string, fields: Record<string, unknown>) => {
    if (event === "phase_progress") progress.push(fields as typeof progress[number]);
  });
  const result = await reviewForLearning();
  for (const phase of ["learning_collect", "learning_integration", "learning_verify", "learning_deduplicate", "learning_describe"]) {
    const updates = progress.filter((update) => update.phase === phase);
    assert.ok(updates.length > 1, phase);
    assert.equal(updates[0].completed, 0, phase);
    assert.equal(updates.at(-1)!.completed, updates[0].total, `${phase}: auch fehlgeschlagene Einheiten sind abgearbeitet`);
    assert.deepEqual(updates.map((update) => update.completed), Array.from({ length: updates[0].total + 1 }, (_, index) => index));
  }
  assert.equal(result.findings.length, 2);
  assert.ok(result.findings.some((finding) => finding.rule.text === "valid"));
  assert.ok(result.findings.some((finding) => finding.rule.text === "integration"));
  assert.ok(result.findings.every((finding) => finding.evidence.some((entry) => entry.path === "lib/unchanged.ts")));
  assert.ok(result.findings.every((finding) => finding.trace.some((entry) => entry.args.path === "lib/unchanged.ts")));
  assert.ok(result.failures.some((failure) => failure.message.includes("Sammeln chunk-2")));
  assert.ok(result.failures.some((failure) => failure.message.includes("Pflichtbelege")));
  assert.equal(result.metrics.rejected, 1);
  assert.equal(result.metrics.verificationErrors, 1);
  assert.equal(result.metrics.invalidCandidates, 2);
  assert.ok(!requests.some((body) => body.messages[0].content.includes("PHASE: VERIFIZIEREN") &&
    body.messages[1].content.includes('"title":"wrong-chunk"')), "Zeile 500 ist geändert, gehört aber einem anderen Diffteil");
  assert.ok(result.metrics.incompleteUnits > 0);
  assert.equal(result.metrics.integrationReason, "multiple_parts");
  assert.ok(result.findings.every((finding) => finding.anchor && finding.evidence.length <= 3));
  assert.ok(requests.every((body) => body.model === (body.messages[0].content.includes("PHASE: VERIFIZIEREN")
    ? "learning-verify" : body.messages[0].content.includes("Vergleiche bestaetigte") ? "learning-dedup" : "learning-search")));
  assert.ok(requests.filter((body) => body.messages[0].content.includes("PHASE: SAMMELN")).length > 10);
  assert.ok(requests.every((body) => !body.messages[1].content.includes(patch)));
});

const localPatch = "diff --git a/src/local.ts b/src/local.ts\n--- a/src/local.ts\n+++ b/src/local.ts\n@@ -1,2 +1,2 @@\n const values = [1];\n-const first = values[0];\n+const first = values[1];\n";
const localCandidate = { path: "src/local.ts", line: 2, title: "Index prüfen", hypothesis: "Index liegt außerhalb des Arrays", check: "Arraylänge lesen", related_paths: [] };
const localCollection = (candidates: unknown[] = [localCandidate]) => ({ summary: "Lokaler Index geändert", interfaces: [], open_questions: [], integration_needed: false, candidates });
const localConfirmation = { status: "confirmed", title: "Vorhandenen Index verwenden", why: "Bei einem Element liefert Index 1 undefined.",
  consequence: "Die weitere Berechnung erhält keinen Wert.", suggestion: "Verwende Index 0. Teste ein Array mit genau einem Element.", required_paths: [],
  evidence: [{ path: "src/local.ts", start_line: 1, end_line: 2, why: "Array und Zugriff" }] };
async function prepareLocal() {
  await writeFile(join(directory, "src/local.ts"), "const values = [1];\nconst first = values[1];\n");
  await writeFile(join(directory, "mr_diff.patch"), localPatch);
  requests.length = 0;
}

test("kleine lokale Änderung: zwei Modellaufrufe, fertiger verifizierter Kommentar und genauer Anker", async () => {
  await prepareLocal();
  handler = (body) => {
    if (body.messages[0].content.includes("PHASE: SAMMELN")) return reply(localCollection());
    assert.match(body.messages[0].content, /PHASE: VERIFIZIEREN/);
    assert.ok(body.messages.some((message) => message.content?.includes("2\tconst first = values[1];")));
    return reply(localConfirmation);
  };
  const { reviewForLearning } = await import("../../sandbox/src/learning");
  const result = await reviewForLearning();
  assert.equal(requests.length, 2, "keine zusätzliche Integration oder Umformulierung");
  assert.equal(result.metrics.integrationReason, "local_complete");
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].suggestion, localConfirmation.suggestion);
  assert.equal(result.findings[0].rationale, localConfirmation.why);
  assert.deepEqual(result.findings[0].anchor, { path: "src/local.ts", line: 2 });
  assert.equal(result.findings[0].modelCalls, 1);
  assert.equal(result.findings[0].trace.filter((entry) => entry.tool === "read_file").length, 1);
  assert.equal(result.findings[0].evidence.length, 1, "kein synthetisch doppelter Ankerbeleg");
});

test("Schnittstellen, offene Fragen, unvollständige Erstanalyse und always behalten die Integrationsprüfung", async () => {
  const { reviewForLearning } = await import("../../sandbox/src/learning");
  const { config } = await import("../../sandbox/src/config");
  for (const scenario of ["interfaces", "questions", "missing-signal", "invalid-anchor", "always", "budget", "failure"] as const) {
    await prepareLocal();
    config.learningIntegration = scenario === "always" ? "always" : "auto";
    handler = (body) => {
      if (body.messages[0].content.includes("PHASE: INTEGRATION")) return reply({ candidates: [] });
      if (scenario === "failure") throw new Error("Sammelfehler");
      if (scenario === "budget" && !body.messages.some((message) => message.role === "tool")) {
        return toolReply(Array.from({ length: 3 }, () => ({ path: "src/local.ts", start_line: 1, end_line: 2 })));
      }
      const value: Record<string, unknown> = localCollection([]);
      if (scenario === "interfaces") value.interfaces = ["Aufrufer betroffen"];
      if (scenario === "questions") value.open_questions = ["Konfiguration unklar"];
      if (scenario === "missing-signal") delete value.integration_needed;
      if (scenario === "invalid-anchor") value.candidates = [{ ...localCandidate, line: 999 }];
      return reply(value);
    };
    try {
      const result = await reviewForLearning();
      assert.ok(requests.some((body) => body.messages[0].content.includes("PHASE: INTEGRATION")), scenario);
      assert.notEqual(result.metrics.integrationReason, "local_complete", scenario);
    } finally { config.learningIntegration = "auto"; }
  }
});

test("offene und widerlegte Verdachtsfälle bleiben getrennt; offene Beispiele sind begrenzt", async () => {
  await prepareLocal();
  handler = (body) => {
    if (body.messages[0].content.includes("PHASE: SAMMELN")) return reply(localCollection([
      ...Array.from({ length: 12 }, (_, index) => ({ ...localCandidate, title: `Offen ${index}`, hypothesis: `Unbekannter Vertrag ${index}` })),
      { ...localCandidate, title: "Widerlegt" }, { ...localCandidate, title: "Ungültig" },
    ]));
    const candidate = JSON.parse(body.messages[1].content.split("\n")[1]);
    if (candidate.title === "Widerlegt") return reply({ status: "rejected", reason: "Aufrufer behandelt undefined." });
    if (candidate.title === "Ungültig") return reply({ ...localConfirmation, evidence: [{ path: "src/local.ts", start_line: 999, end_line: 999, why: "ungelesen" }] });
    return reply({ status: "inconclusive", reason: "API-Vertrag fehlt. ".repeat(50) });
  };
  const { reviewForLearning } = await import("../../sandbox/src/learning");
  const result = await reviewForLearning();
  assert.equal(result.findings.length, 0);
  assert.equal(result.metrics.inconclusive, 12);
  assert.equal(result.metrics.rejected, 1);
  assert.equal(result.metrics.verificationErrors, 1);
  assert.equal(result.metrics.openIssues.length, 10);
  assert.ok(result.metrics.openIssues.every((issue) => issue.reason.length <= 400));
});

test("ungültige und verkettete Dublettenreferenzen erhalten alle bestätigten Befunde", async () => {
  const { reviewForLearning } = await import("../../sandbox/src/learning");
  for (const scenario of ["unknown", "self", "forward", "chain", "repeated"] as const) {
    await prepareLocal();
    handler = (body) => {
      const system = body.messages[0].content;
      if (system.includes("PHASE: SAMMELN")) return reply(localCollection(
        ["A", "B", "C"].map((title) => ({ ...localCandidate, title })),
      ));
      if (system.includes("PHASE: VERIFIZIEREN")) {
        const candidate = JSON.parse(body.messages[1].content.split("\n")[1]);
        return reply({ ...localConfirmation, title: candidate.title });
      }
      assert.match(system, /Vergleiche bestaetigte/);
      assert.equal(body.tools, undefined);
      const { incoming } = JSON.parse(body.messages[1].content);
      const [a, b, c] = incoming.map((entry: { id: string }) => entry.id);
      const duplicate = { id: b, duplicate_of: a };
      const responses = {
        unknown: [duplicate, { id: c, duplicate_of: "invented-id" }],
        self: [duplicate, { id: c, duplicate_of: c }],
        forward: [{ id: a, duplicate_of: c }],
        chain: [{ id: c, duplicate_of: b }, duplicate],
        repeated: [duplicate, duplicate],
      };
      return reply({ duplicates: responses[scenario] });
    };
    const result = await reviewForLearning();
    assert.equal(result.metrics.confirmed, 3, scenario);
    assert.equal(result.findings.length, 3, scenario);
    assert.equal(result.failures.length, 1, scenario);
    assert.match(result.failures[0].message, /Dublettenprüfung/, scenario);
  }
});

test("reine Löschung verlangt alten Anker und gelesene aktuelle Belege", async () => {
  await prepareLocal();
  await writeFile(join(directory, "src/removed.ts"), "validate(input);\n");
  execFileSync("git", ["init", "--quiet"], { cwd: directory });
  execFileSync("git", ["add", "src/removed.ts"], { cwd: directory });
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.test", "commit", "--quiet", "-m", "base"], { cwd: directory });
  const { setBaseSha } = await import("../../sandbox/src/tools");
  setBaseSha(execFileSync("git", ["rev-parse", "HEAD"], { cwd: directory, encoding: "utf8" }).trim());
  await rm(join(directory, "src/removed.ts"));
  await writeFile(join(directory, "mr_diff.patch"), "diff --git a/src/removed.ts b/src/removed.ts\n--- a/src/removed.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-validate(input);\n");
  const { reviewForLearning } = await import("../../sandbox/src/learning");
  for (const scenario of ["valid", "only-base", "wrong-revision"] as const) {
    handler = (body) => {
      if (body.messages[0].content.includes("PHASE: SAMMELN")) return reply(localCollection([
        { ...localCandidate, path: "src/removed.ts", line: 1, side: "old", related_paths: ["src/local.ts"] },
      ]));
      if (body.messages[0].content.includes("PHASE: INTEGRATION")) return reply({ candidates: [] });
      if (!body.messages.some((message) => message.role === "tool")) return toolReply([{ path: "src/local.ts", start_line: 1, end_line: 2 }]);
      return reply({ ...localConfirmation, evidence: [
        { path: "src/removed.ts", start_line: 1, end_line: 1, why: "Validierung entfernt", ...(scenario === "wrong-revision" ? {} : { revision: "base" }) },
        ...(scenario === "only-base" ? [] : localConfirmation.evidence),
      ] });
    };
    const result = await reviewForLearning();
    if (scenario === "valid") {
      assert.deepEqual(result.findings[0].anchor, { path: "src/removed.ts", line: 1, side: "old" });
      assert.equal(result.findings[0].evidence[0].revision, "base");
      assert.equal(result.findings[0].rule.origin, "learning");
    } else {
      assert.equal(result.findings.length, 0, scenario);
      assert.equal(result.metrics.verificationErrors, 1, scenario);
    }
  }
});

test("nur sichtbare gelesene Zeilen sind Belege; Budget erzwingt toolfreien Abschluss", async () => {
  await writeFile(join(directory, "src/truncated.ts"), Array.from({ length: 400 }, (_, index) => `${index}: ${"x".repeat(100)}`).join("\n"));
  let finalWithoutTools = false;
  handler = (body) => {
    if (!body.messages.some((message) => message.role === "tool")) return toolReply([{ path: "src/truncated.ts", start_line: 1, end_line: 400 }]);
    finalWithoutTools = !body.tools;
    return reply({ done: true });
  };
  const { runReviewSession, verifiedEvidence } = await import("../../sandbox/src/review-session");
  const session = await runReviewSession("JSON", "Lies Datei", { searchRounds: 0, fileReads: 1 });
  assert.ok(finalWithoutTools);
  assert.ok(session.result.budgetExhausted);
  const evidence = (line: number) => [{ path: "src/truncated.ts", start_line: line, end_line: line, why: "Beleg" }];
  assert.ok(verifiedEvidence(evidence(1), session.result.excerpts));
  assert.equal(verifiedEvidence(evidence(400), session.result.excerpts), null);
});

test("abgeschnittene Modellantwort wird als Fehler erkannt, auch bei syntaktisch gültigem JSON", async () => {
  handler = () => ({ choices: [{ finish_reason: "length", message: { content: '{"candidates":[]}' } }] });
  const { runReviewSession } = await import("../../sandbox/src/review-session");
  await assert.rejects(runReviewSession("JSON", "Test", { searchRounds: 0, fileReads: 0 }), /abgeschnitten/);
});

test("Lernwerkzeuge durchsuchen und lesen große Repository-Dateien und Originaldiffs", async () => {
  const source = Array.from({ length: 7000 }, (_, index) => `${index === 6500 ? "integrationTarget" : "source"} ${"x".repeat(100)}`).join("\n");
  assert.ok(Buffer.byteLength(source) > 512 * 1024);
  await writeFile(join(directory, "src/large.ts"), source);
  await writeFile(join(directory, "mr_diff.patch"), source);
  const { grep, readFileTool } = await import("../../sandbox/src/tools");
  const context = { role: "reader" as const, trace: [], largeTextFiles: true };
  for (const path of ["src/large.ts", "mr_diff.patch"]) {
    const found = await grep(context, { path, pattern: "integrationTarget" });
    assert.match(found, /:6501: integrationTarget/);
    const read = await readFileTool(context, { path, start_line: 6501, end_line: 6501 });
    assert.match(read, /6501\tintegrationTarget/);
  }
  // Bestehende Architektur-Werkzeugbudgets gelten weiterhin ohne Opt-in.
  assert.match(await readFileTool({ role: "reader", trace: [] }, { path: "src/large.ts" }), /Datei zu gross/);
  handler = (body) => body.messages.some((message) => message.role === "tool")
    ? reply({ done: true }) : toolReply([{ path: "src/large.ts", start_line: 6501, end_line: 6501 }]);
  const { runReviewSession, verifiedEvidence } = await import("../../sandbox/src/review-session");
  const session = await runReviewSession("JSON", "Lies große Datei", { searchRounds: 0, fileReads: 1 });
  assert.ok(verifiedEvidence([{ path: "src/large.ts", start_line: 6501, end_line: 6501, why: "Verbindung" }], session.result.excerpts));
});
