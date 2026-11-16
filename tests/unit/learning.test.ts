import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage } from "node:http";
import { join } from "node:path";

interface RequestBody {
  messages: Array<{ role: string; content: string }>;
  tools?: Array<{ function: { name: string } }>;
}

let directory: string;
let handler: (body: RequestBody) => unknown;
const requests: RequestBody[] = [];
const reply = (value: unknown) => ({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }], usage: { prompt_tokens: 100, completion_tokens: 20 } });
const toolReply = (calls: Array<{ path: string; start_line?: number; end_line?: number }>) => ({ choices: [{ finish_reason: "tool_calls", message: {
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
      return reply({ summary: "Client liest Antwortfeld", interfaces: ["response.userId aus lib/unchanged.ts"], candidates: first ? [
        candidate("valid"), candidate("duplicate"), candidate("missing-evidence"), candidate("rejected"), candidate("wrong-anchor", "src/file0.ts", 9999),
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
        return toolReply([{ path: value.path, start_line: value.line, end_line: value.line }, { path: "lib/unchanged.ts", start_line: 1, end_line: 1 }]);
      }
      return reply({ status: "confirmed", why: value.title, consequence: "Falsches Antwortfeld", suggestion: "userId verwenden",
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
    assert.match(system, /Du formulierst/);
    assert.equal(body.tools, undefined);
    const value = JSON.parse(input);
    assert.match(value.original, /export const response/);
    if (value.title === "integration") return reply({}); // bestätigten Befund als Fallback erhalten
    return reply({ title: "Antwortfeld korrigieren", why: value.why, consequence: value.consequence, suggestion: value.suggestion });
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
  assert.ok(result.findings.some((finding) => finding.rule.text === "Antwortfeld korrigieren"));
  assert.ok(result.findings.some((finding) => finding.rule.text === "integration"));
  assert.ok(result.findings.every((finding) => finding.evidence.some((entry) => entry.path === "lib/unchanged.ts")));
  assert.ok(result.findings.every((finding) => finding.trace.some((entry) => entry.args.path === "lib/unchanged.ts")));
  assert.ok(result.failures.some((failure) => failure.message.includes("Sammeln chunk-2")));
  assert.ok(result.failures.some((failure) => failure.message.includes("Pflichtbelege")));
  assert.ok(result.failures.some((failure) => failure.message.includes("Beschreibung")));
  assert.ok(requests.filter((body) => body.messages[0].content.includes("PHASE: SAMMELN")).length > 10);
  assert.ok(requests.every((body) => !body.messages[1].content.includes(patch)));
});

test("nur sichtbare gelesene Zeilen sind Belege; Budget erzwingt toolfreien Abschluss", async () => {
  await writeFile(join(directory, "src/truncated.ts"), Array.from({ length: 400 }, (_, index) => `${index}: ${"x".repeat(100)}`).join("\n"));
  let finalWithoutTools = false;
  handler = (body) => {
    if (!body.messages.some((message) => message.role === "tool")) return toolReply([{ path: "src/truncated.ts", start_line: 1, end_line: 400 }]);
    finalWithoutTools = !body.tools;
    return reply({ done: true });
  };
  const { runLearningSession, verifiedEvidence } = await import("../../sandbox/src/learning-session");
  const session = await runLearningSession("JSON", "Lies Datei", { searchRounds: 0, fileReads: 1 });
  assert.ok(finalWithoutTools);
  assert.ok(session.result.budgetExhausted);
  const evidence = (line: number) => [{ path: "src/truncated.ts", start_line: line, end_line: line, why: "Beleg" }];
  assert.ok(verifiedEvidence(evidence(1), session.result.excerpts));
  assert.equal(verifiedEvidence(evidence(400), session.result.excerpts), null);
});

test("abgeschnittene Modellantwort wird als Fehler erkannt, auch bei syntaktisch gültigem JSON", async () => {
  handler = () => ({ choices: [{ finish_reason: "length", message: { content: '{"candidates":[]}' } }] });
  const { runLearningSession } = await import("../../sandbox/src/learning-session");
  await assert.rejects(runLearningSession("JSON", "Test", { searchRounds: 0, fileReads: 0 }), /abgeschnitten/);
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
  const { runLearningSession, verifiedEvidence } = await import("../../sandbox/src/learning-session");
  const session = await runLearningSession("JSON", "Lies große Datei", { searchRounds: 0, fileReads: 1 });
  assert.ok(verifiedEvidence([{ path: "src/large.ts", start_line: 6501, end_line: 6501, why: "Verbindung" }], session.result.excerpts));
});
