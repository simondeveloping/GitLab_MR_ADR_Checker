import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import type { AdrDocument } from "../../sandbox/src/rulebase";

let extractionCalls = 0;
let checkCalls = 0;
let invalid = true;
let malformed = false;
let checksPerBatch: number[] = [];
const cache = new Map<string, unknown[]>();
const server = createServer(async (request, response) => {
    let body = "";
    for await (const part of request) body += part;
    const parsed = JSON.parse(body);
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/rule-cache") {
      if (parsed.rules) cache.set(parsed.key, parsed.rules);
      response.end(JSON.stringify({ rules: cache.get(parsed.key) ?? null }));
      return;
    }
    const messages = parsed.messages as Array<{ content: string }>;
    const check = messages[0].content.includes("Pruefe, ob jede formulierte");
    if (check) checkCalls += 1; else extractionCalls += 1;
    const batch = check ? JSON.parse(messages[1].content).rules as Array<{ text: string; index: number }> : [];
    if (check) checksPerBatch.push(batch.length);
    const value = check ? { checks: malformed ? [] : batch.map((rule) => ({ index: rule.index, supported: !rule.text.includes("XML") })) } : { rules: invalid ? [
      { text: "Verwende nur JSON.", start_line: 4, end_line: 4, quote: "Nur JSON verwenden." },
      { text: "Verwende nur XML.", start_line: 4, end_line: 4, quote: "Nur JSON verwenden." },
      { text: "Benutze unbekannte Quelle.", start_line: 6, end_line: 6, quote: "unbekannt" },
    ] : Array.from({ length: 25 }, (_, index) => ({ text: `Verwende nur JSON, Regel ${index}.`, start_line: 4, end_line: 4, quote: "Nur JSON verwenden." })) };
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }] }));
});
before(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  Object.assign(process.env, { REVIEW_ID: "source-check-test", REPO_URL: "https://example.test/repo", MR_SHA: "test",
     MR_TARGET_BRANCH: "main", CALLBACK_URL: `http://127.0.0.1:${address.port}/callback`, CALLBACK_TOKEN: "test",
     LLM_BASE_URL: `http://127.0.0.1:${address.port}`, LLM_API_KEY: "test", ADR_RULE_CACHE: "1" });
});
after(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("ADR-Regel braucht eine wörtliche Stelle in einer gültigen Entscheidungssektion", async () => {
  const { sourcedRule, stripDistractorSections } = await import("../../sandbox/src/extract");
  const content = "# Architektur\n\n## Decision\nNur JSON verwenden.\n\n## Considered Options\nXML verwenden.\nNur JSON verwenden.\n";
  const doc: AdrDocument = { title: "Architektur", file: "001.md", origin: "project", status: "accepted", content };
  const prepared = stripDistractorSections(content);
  assert.deepEqual(sourcedRule({ text: "Verwende nur JSON.", start_line: 4, end_line: 4, quote: "Nur JSON verwenden." }, doc, prepared),
    { text: "Verwende nur JSON.", adrSource: { startLine: 4, endLine: 4, quote: "Nur JSON verwenden." } });
  assert.equal(sourcedRule({ text: "Verwende nur XML.", start_line: 7, end_line: 7, quote: "XML verwenden." }, doc, prepared), null);
  assert.equal(sourcedRule({ text: "Verwende nur JSON.", start_line: 8, end_line: 8, quote: "Nur JSON verwenden." }, doc, prepared), null);
  assert.equal(sourcedRule({ text: "Verwende nur JSON.", start_line: 5, end_line: 5, quote: "Nur JSON verwenden." }, doc, prepared), null);
});

test("Extraktion übernimmt nur vom ADR gedeckte Regeln und meldet verworfene Regeln", async () => {
    const { extractRules } = await import("../../sandbox/src/extract");
    const result = await extractRules([{ title: "Architektur", file: "001.md", origin: "project", status: "accepted",
      content: "# Architektur\n\n## Decision\nNur JSON verwenden.\n" }], ["src.ts"]);
    assert.deepEqual(result.rules.map((rule) => rule.text), ["Verwende nur JSON."]);
    assert.equal(result.rules[0].adrSource?.startLine, 4);
    assert.match(result.failures[0].message, /2 Regeln.*verworfen/);
    assert.equal(checkCalls, 1, "zwei gültige Quellen in einem unabhängigen Modellaufruf prüfen");
});

test("25 Regeln brauchen drei Quellenpakete; Cache ist MR-unabhängig und behält Kontext nur im Speicher", async () => {
  const { extractRules, extractionCacheKey } = await import("../../sandbox/src/extract");
  const { ruleInput } = await import("../../sandbox/src/rule-context");
  const { config } = await import("../../sandbox/src/config");
  invalid = false;
  checksPerBatch = [];
  const doc: AdrDocument = { title: "Cache", file: "cached.md", origin: "project", status: "accepted",
    content: "# Architektur\n\n## Decision\nNur JSON verwenden.\nAusnahme: Legacy-Import.\n" };
  const first = await extractRules([doc], ["first.ts"]);
  assert.equal(first.rules.length, 25);
  assert.deepEqual(checksPerBatch, [12, 12, 1]);
  const calls = extractionCalls + checkCalls;
  const second = await extractRules([doc], ["completely-different.ts"]);
  assert.equal(extractionCalls + checkCalls, calls);
  assert.deepEqual(first.rules, second.rules);
  assert.equal(second.adrTokenUsage[0].cacheHit, true);
  assert.equal(second.adrTokenUsage[0].totalTokens, 0);
  assert.match(ruleInput(second.rules), /Ausnahme: Legacy-Import/);
  assert.doesNotMatch(JSON.stringify(second.rules), /Legacy-Import/);
  const key = extractionCacheKey(doc);
  assert.notEqual(extractionCacheKey({ ...doc, content: doc.content + "Neue Ausnahme." }), key);
  const model = config.fastModel;
  try { config.fastModel = "changed-model"; assert.notEqual(extractionCacheKey(doc), key); }
  finally { config.fastModel = model; }
});

test("unvollständige Quellenprüfung wird nicht gecacht; beschädigte Cachequellen werden neu extrahiert", async () => {
  const { extractRules, extractionCacheKey } = await import("../../sandbox/src/extract");
  const doc: AdrDocument = { title: "Fehler", file: "bad.md", origin: "project", status: "accepted",
    content: "# Architektur\n\n## Decision\nNur JSON verwenden.\n" };
  malformed = true;
  const failed = await extractRules([doc]);
  assert.equal(failed.rules.length, 0);
  assert.ok(failed.failures.length);
  assert.equal(cache.has(extractionCacheKey(doc)), false);
  malformed = false;
  cache.set(extractionCacheKey(doc), [{ text: "Verwende etwas Fremdes.", adrSource: { startLine: 4, endLine: 4, quote: "Nicht im ADR" } }]);
  const repaired = await extractRules([doc]);
  assert.equal(repaired.rules.length, 25);
  assert.equal(repaired.adrTokenUsage[0].cacheHit, false);
});
