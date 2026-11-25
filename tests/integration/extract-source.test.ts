import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import type { AdrDocument } from "../../sandbox/src/rulebase";

let extractionCalls = 0;
let invalid = true;
let descriptive = false;
const cache = new Map<string, unknown[]>();
const server = createServer(async (request, response) => {
  try {
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
    extractionCalls += 1;
    if (descriptive) {
      assert.match(messages[0].content, /alle Festlegungen/);
      assert.match(messages[1].content, /9: `TaskStatus` ist eine Union/);
    }
    const value = descriptive ? { rules: [
      { text: "Prüfe Statusänderungen im Service gegen die erlaubten Übergänge.", start_line: 9, end_line: 9,
        quote: "Service-Updates prüfen Statusänderungen gegen diese Regeln." },
      { text: "Erlaube unabhängig aktualisierte andere Felder.", start_line: 12, end_line: 12,
        quote: "Andere Felder dürfen unabhängig aktualisiert werden." },
    ] } : { rules: invalid ? [
      { text: "Verwende nur JSON.", start_line: 4, end_line: 4, quote: "Nur JSON verwenden." },
      { text: "Verwende nur XML.", start_line: 4, end_line: 4, quote: "Nur XML verwenden." },
      { text: "Benutze unbekannte Quelle.", start_line: 6, end_line: 6, quote: "unbekannt" },
    ] : Array.from({ length: 25 }, (_, index) => ({ text: `Verwende nur JSON, Regel ${index}.`, start_line: 4, end_line: 4, quote: "Nur JSON verwenden." })) };
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }] }));
  } catch (error) {
    response.writeHead(500);
    response.end(String(error));
  }
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

test("beschreibende Festlegung aus dem Entscheidungsabschnitt wird als Regel übernommen", async () => {
  const { extractRules } = await import("../../sandbox/src/extract");
  descriptive = true;
  try {
    const content = "# Workflow\n\n- **Status:** Akzeptiert\n\n## Kontext\nNur eine Demo.\n\n## Entscheidung\n" +
      "`TaskStatus` ist eine Union aus `todo`, `in_progress` und `done`. `src/domain/transitions.ts` erlaubt Offen → In Arbeit, In Arbeit → Offen/Erledigt und Erledigt → In Arbeit. Service-Updates prüfen Statusänderungen gegen diese Regeln.\n\n" +
      "## Konsequenzen\nAndere Felder dürfen unabhängig aktualisiert werden.\n";
    const result = await extractRules([{ title: "Workflow", file: "workflow.md", origin: "project", status: "Akzeptiert", content }]);
    assert.deepEqual(result.rules.map((rule) => rule.text), ["Prüfe Statusänderungen im Service gegen die erlaubten Übergänge."]);
    assert.equal(result.rules[0].adrSource?.startLine, 9);
    assert.equal(result.failures.length, 1);
    assert.match(result.failures[0].message, /1 Regel.*wörtlicher Quelle/);
  } finally {
    descriptive = false;
  }
});

test("Extraktion übernimmt wörtlich belegte Regeln und meldet ungültige Quellstellen", async () => {
  const { extractRules } = await import("../../sandbox/src/extract");
  const result = await extractRules([{ title: "Architektur", file: "001.md", origin: "project", status: "accepted",
    content: "# Architektur\n\n## Decision\nNur JSON verwenden.\n" }], ["src.ts"]);
  assert.deepEqual(result.rules.map((rule) => rule.text), ["Verwende nur JSON."]);
  assert.equal(result.rules[0].adrSource?.startLine, 4);
  assert.match(result.failures[0].message, /2 Regeln.*wörtlicher Quelle/);
});

test("25 Regeln werden beibehalten; Cache ist MR-unabhängig und behält Kontext nur im Speicher", async () => {
  const { extractRules, extractionCacheKey } = await import("../../sandbox/src/extract");
  const { ruleInput } = await import("../../sandbox/src/rule-context");
  const { config } = await import("../../sandbox/src/config");
  invalid = false;
  const doc: AdrDocument = { title: "Cache", file: "cached.md", origin: "project", status: "accepted",
    content: "# Architektur\n\n## Decision\nNur JSON verwenden.\nAusnahme: Legacy-Import.\n" };
  const first = await extractRules([doc], ["first.ts"]);
  assert.equal(first.rules.length, 25);
  const calls = extractionCalls;
  const second = await extractRules([doc], ["completely-different.ts"]);
  assert.equal(extractionCalls, calls);
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

test("beschädigte Cachequellen werden neu extrahiert", async () => {
  const { extractRules, extractionCacheKey } = await import("../../sandbox/src/extract");
  const doc: AdrDocument = { title: "Fehler", file: "bad.md", origin: "project", status: "accepted",
    content: "# Architektur\n\n## Decision\nNur JSON verwenden.\n" };
  cache.set(extractionCacheKey(doc), [{ text: "Verwende etwas Fremdes.", adrSource: { startLine: 4, endLine: 4, quote: "Nicht im ADR" } }]);
  const repaired = await extractRules([doc]);
  assert.equal(repaired.rules.length, 25);
  assert.equal(repaired.adrTokenUsage[0].cacheHit, false);
});
