import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import type { SandboxResult } from "../../sandbox/src/types";

interface ModelRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
}

const run = promisify(execFile);
const main = resolve("sandbox/src/main.ts");
const ruleText = "Nur vorhandene Array-Indizes verwenden.";
let directory: string;
let baseUrl: string;
let expectedChatPath = "/chat/response";
let requests: ModelRequest[] = [];
let results: SandboxResult[] = [];
const apiErrors: string[] = [];
const server = createServer(async (request, response) => {
  try {
    let body = "";
    for await (const part of request) body += part;
    if (request.url === "/callback") {
      assert.equal(request.headers.authorization, "Bearer test-callback");
      results.push(JSON.parse(body) as SandboxResult);
      response.writeHead(204);
      response.end();
      return;
    }
    assert.equal(request.url, expectedChatPath);
    const parsed = JSON.parse(body) as ModelRequest;
    requests.push(parsed);
    const system = parsed.messages[0].content;
    const input = parsed.messages[1].content;
    let value: unknown;
    if (system.startsWith("Du zerlegst ein Architecture Decision Record")) {
      const line = Number(input.split("\n").find((entry) => entry.endsWith(`: ${ruleText}`))?.split(":", 1)[0]);
      value = { rules: [{ text: ruleText, start_line: line, end_line: line, quote: ruleText }] };
    } else if (system.startsWith("Ordne Architekturregeln")) {
      value = { selected: [0] };
    } else if (system.startsWith("Du suchst moegliche Verstoesse")) {
      const id = /"id":"([^"]+)"/.exec(input)![1];
      value = { candidates: [{ rule_id: id, path: "src.ts", line: 2, hypothesis: "Index 1 liegt außerhalb des Arrays." }] };
    } else if (system.startsWith("Pruefe genau einen")) {
      assert.match(input, /Nur vorhandene Array-Indizes verwenden/);
      assert.ok(parsed.messages.some((message) => message.content?.includes("2\tconst first = values[1];")));
      value = { status: "confirmed", rationale: "Der Zugriff auf Index 1 widerspricht der ADR-Entscheidung.",
        consequence: "Der Zugriff liefert undefined.", suggestion: "Verwende den vorhandenen Index 0.", required_paths: [],
        evidence: [{ path: "src.ts", start_line: 1, end_line: 2, why: "Array und geänderter Zugriff" }] };
    } else if (system.includes("PHASE: SAMMELN")) {
      value = { summary: "Lokaler Index geändert", interfaces: [], open_questions: [], integration_needed: false,
        candidates: [{ path: "src.ts", line: 2, title: "Index prüfen", hypothesis: "Index außerhalb des Arrays",
          check: "Arraylänge lesen", related_paths: [] }] };
    } else if (system.includes("PHASE: VERIFIZIEREN")) {
      value = { status: "confirmed", title: "Index prüfen", why: "Index 1 liegt außerhalb des Arrays.",
        consequence: "Der Zugriff liefert undefined.", suggestion: "Verwende Index 0.", required_paths: [],
        evidence: [{ path: "src.ts", start_line: 1, end_line: 2, why: "Array und Zugriff" }] };
    } else throw new Error(`Unerwarteter zusätzlicher Modellaufruf: ${system}`);
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }],
      usage: { prompt_tokens: 100, completion_tokens: 20 } }));
  } catch (error) {
    apiErrors.push(String(error));
    response.writeHead(400);
    response.end(String(error));
  }
});

before(async () => {
  directory = await mkdtemp("/tmp/opencode/learning-explanation-pipeline-");
  await mkdir(join(directory, "standards"));
  for (const adr of ["accepted", "proposed", "absent", "inline-status"]) {
    const repo = join(directory, adr);
    await mkdir(repo);
    if (adr !== "absent") {
      await mkdir(join(repo, "docs/adr"), { recursive: true });
      await writeFile(join(repo, "docs/adr/001-indizes.md"), adr === "inline-status"
        ? `# Indizes\n\n- **Status:** Akzeptiert\n- **Datum:** 2026-01-12\n\n## Kontext\nStatus: proposed (nur Kontext)\n\n## Entscheidung\n${ruleText}\n`
        : `# Indizes\n\n## Status\n${adr}\n\n## Entscheidung\n${ruleText}\n`);
    }
    await writeFile(join(repo, "src.ts"), "const values = [1];\nconst first = values[0];\n");
    const git = (args: string[]) => execFileSync("git", args, { cwd: repo });
    git(["init", "--quiet", "--initial-branch=main"]);
    git(["add", "."]);
    git(["-c", "user.name=Test", "-c", "user.email=test@example.test", "commit", "--quiet", "-m", "base"]);
    git(["checkout", "--quiet", "-b", "feature"]);
    await writeFile(join(repo, "src.ts"), "const values = [1];\nconst first = values[1];\n");
    git(["add", "."]);
    git(["-c", "user.name=Test", "-c", "user.email=test@example.test", "commit", "--quiet", "-m", "change"]);
  }
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await rm(directory, { recursive: true, force: true });
});

async function pipeline(adr: string, flag?: string, chatPath?: string) {
  requests = [];
  results = [];
  apiErrors.length = 0;
  expectedChatPath = chatPath ?? "/chat/response";
  const work = await mkdtemp(join(directory, "run-"));
  const environment: NodeJS.ProcessEnv = { ...process.env,
    REVIEW_ID: "learning-explanation-test", REPO_URL: join(directory, adr), MR_SHA: "feature", MR_TARGET_BRANCH: "main",
    CALLBACK_URL: `${baseUrl}/callback`, CALLBACK_TOKEN: "test-callback", WORK_DIR: work, REPO_DIR: join(work, "repo"),
    GROUP_STANDARD_DIR: join(directory, "standards"), PROJECT_ADR_DIR: "docs/adr", ADR_RULE_CACHE: "0",
    LLM_BASE_URL: baseUrl, LLM_API_KEY: "test-key", LLM_MODEL: "adr-search", LLM_FAST_MODEL: "adr-fast", LLM_VERIFY_MODEL: "adr-verify",
    LEARNING_MODEL: "learning-search", LEARNING_VERIFY_MODEL: "learning-verify", LEARNING_DEDUP_MODEL: "learning-dedup",
    LEARNING_INTEGRATION_MODE: "auto", LEARNING_CHUNK_BYTES: "32000", LEARNING_MAX_FINDINGS: "20",
    BUDGET_SEARCH_ROUNDS: "2", BUDGET_FILE_READS: "3", LEARNING_BUDGET_SEARCH_ROUNDS: "2", LEARNING_BUDGET_FILE_READS: "3",
    JUDGING_CONCURRENCY: "1", EXTRACTION_CONCURRENCY: "1", LEARNING_CONCURRENCY: "1",
    LLM_TEMPERATURE: "0",
  };
  delete environment.LEARNING_USERS;
  delete environment.ADR_LEARNING_EXPLANATION;
  delete environment.LLM_CHAT_PATH;
  if (flag !== undefined) environment.ADR_LEARNING_EXPLANATION = flag;
  if (chatPath !== undefined) environment.LLM_CHAT_PATH = chatPath;
  const output = await run(process.execPath, ["--import", "tsx", main], { env: environment, timeout: 20_000 });
  assert.deepEqual(apiErrors, []);
  const result = results[0];
  assert.ok(result, output.stdout + output.stderr);
  assert.deepEqual(result.failures, []);
  return { result, requests };
}

test("LLM_CHAT_PATH wählt den Chat-Endpunkt ohne Änderung an der Pipeline", async () => {
  const current = await pipeline("absent", undefined, "/chat/completions");
  assert.equal(current.result.mode, "learning");
  assert.ok(current.requests.length > 0);
});

test("Sandbox-Einstieg behält architecture, ADR-Prüfung und Aufrufzahl; nur die Verifikation erklärt didaktisch", async () => {
  const normal = await pipeline("accepted");
  assert.equal(normal.result.mode, "architecture");
  assert.equal(normal.result.ruleOrigin, "project");
  assert.deepEqual(normal.result.adrFiles, ["001-indizes.md"]);
  assert.equal(normal.result.rules.length, 1);
  assert.equal(normal.result.findings[0].verdict, "NC");
  assert.equal(normal.result.stats.modelCalls, 4);
  assert.equal(normal.result.stats.learning, undefined);
  const verify = normal.requests.find((request) => request.messages[0].content.startsWith("Pruefe genau einen"))!;
  // Fingerabdruck des bestehenden Prompts vor dem Opt-in: Standard bleibt bytegleich.
  assert.equal(createHash("sha256").update(verify.messages[0].content).digest("hex"),
    "28914da262c9e43605c1da9a1ffba694e52c2728db805840e799f2daf988500b");
  for (const flag of ["0", "true", "1"]) {
    const current = await pipeline("accepted", flag);
    assert.equal(current.result.mode, "architecture");
    assert.equal(current.result.stats.modelCalls, normal.result.stats.modelCalls);
    assert.deepEqual(current.result.rules, normal.result.rules);
    assert.deepEqual(current.result.droppedRules, normal.result.droppedRules);
    assert.equal(current.result.findings[0].verdict, "NC");
    assert.deepEqual(current.result.findings[0].evidence, normal.result.findings[0].evidence);
    assert.equal(current.requests.length, normal.requests.length);
    for (const [index, request] of current.requests.entries()) {
      const standard = normal.requests[index];
      if (flag === "1" && request.messages[0].content.startsWith("Pruefe genau einen")) {
        const prompt = request.messages[0].content;
        assert.ok(prompt.startsWith(standard.messages[0].content + "\n\n"));
        assert.match(prompt, /einfacher, didaktischer deutscher Sprache/);
        assert.match(prompt, /ADR-Entscheidung/);
        assert.match(prompt, /tatsaechlich gelesenen Belege/);
        assert.match(prompt, /erfinde keine Absichten, Risiken/);
        assert.match(prompt, /Keine allgemeine Bug-Analyse/);
        assert.match(prompt, /inconclusive/);
        assert.deepEqual({ ...request, messages: standard.messages }, standard, "Modell, Tools und Budgets bleiben gleich");
        assert.deepEqual(request.messages.slice(1), standard.messages.slice(1));
      } else assert.deepEqual(request, standard);
    }
  }
});

test("ohne gültige Projekt-ADRs bleibt der bestehende Lernreview mit und ohne Autorenkennzeichen unverändert", async () => {
  for (const adr of ["absent", "proposed"]) {
    const normal = await pipeline(adr, "0");
    const selected = await pipeline(adr, "1");
    for (const current of [normal, selected]) {
      assert.equal(current.result.mode, "learning");
      assert.equal(current.result.ruleOrigin, "learning");
      assert.deepEqual(current.result.rules, []);
      assert.deepEqual(current.result.adrFiles, []);
      assert.equal(current.result.findings[0].rule.origin, "learning");
      assert.equal(current.result.stats.modelCalls, 2);
      assert.equal(current.result.stats.architecture, undefined);
      assert.deepEqual(current.requests.map((request) => request.model), ["learning-search", "learning-verify"]);
    }
    const withoutCandidateIds = (items: ModelRequest[]) => items.map((request) => ({ ...request,
      messages: request.messages.map((message) => ({ ...message,
        content: message.content.replace(/"id":"[0-9a-f-]{36}"/g, '"id":"candidate-id"') })),
    }));
    assert.deepEqual(withoutCandidateIds(selected.requests), withoutCandidateIds(normal.requests),
      "sämtliche Lernprompts und Modellparameter bleiben bis auf zufällige Kandidaten-IDs gleich");
    assert.equal(selected.result.findings[0].rationale, normal.result.findings[0].rationale);
    assert.deepEqual(selected.result.findings[0].evidence, normal.result.findings[0].evidence);
  }
});

test("ADR mit fett gedrucktem Status unter docs/adr aktiviert den ADR-Check mit didaktischer Erklärung", async () => {
  const current = await pipeline("inline-status", "1");
  assert.equal(current.result.mode, "architecture");
  assert.equal(current.result.ruleOrigin, "project");
  assert.deepEqual(current.result.adrFiles, ["001-indizes.md"]);
  assert.deepEqual(current.result.changedFiles, ["src.ts"]);
  assert.equal(current.result.stats.learning, undefined);
  assert.equal(current.result.findings[0].verdict, "NC");
  assert.match(current.requests.find((request) => request.messages[0].content.startsWith("Pruefe genau einen"))!.messages[0].content,
    /einfacher, didaktischer deutscher Sprache/);
  assert.ok(!current.requests.some((request) => request.messages[0].content.includes("PHASE: SAMMELN")));
});
