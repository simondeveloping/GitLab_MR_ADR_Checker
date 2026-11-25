import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { accessRuleCache, RULE_CACHE_MAX_BYTES, RULE_CACHE_MAX_ENTRIES, RULE_CACHE_TTL_MS } from "../../src/lib/reviews/rule-cache";
import { saveReview } from "../../src/lib/reviews/store";
import { makeReview } from "../fixtures";

let directory: string;
const oldDataDir = process.env.DATA_DIR;
const scope = "a".repeat(64);
const key = (index: number) => index.toString(16).padStart(64, "0");
const rules = [{ text: "Verwende ausschließlich JSON.", adrSource: { startLine: 1, endLine: 1, quote: "Nur JSON." } }];
before(async () => {
  directory = await mkdtemp("/tmp/opencode/rule-cache-test-");
  process.env.DATA_DIR = directory;
});
after(async () => {
  if (oldDataDir === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = oldDataDir;
  await rm(directory, { recursive: true, force: true });
});

test("Cache isoliert Repositories und bleibt bei parallelen Schreibern auf eine kleine Datei begrenzt", async () => {
  await accessRuleCache(scope, key(1), rules);
  assert.deepEqual(await accessRuleCache(scope, key(1)), rules);
  assert.equal(await accessRuleCache("b".repeat(64), key(1)), null);
  const largeRules = Array.from({ length: 25 }, () => ({ ...rules[0], text: "x".repeat(1200) }));
  await Promise.all(Array.from({ length: 140 }, (_, index) => accessRuleCache(scope, key(index + 2), largeRules)));
  const file = join(directory, "adr-rule-cache.json");
  assert.ok((await stat(file)).size <= RULE_CACHE_MAX_BYTES);
  const entries = JSON.parse(await readFile(file, "utf8"));
  assert.ok(entries.length <= RULE_CACHE_MAX_ENTRIES);
  assert.ok(entries.length < 128, "Bytegrenze greift auch vor der Eintragsgrenze");
  assert.equal(await accessRuleCache(scope, key(1)), null, "ältester Eintrag verdrängt");
  assert.deepEqual(await readdir(directory), ["adr-rule-cache.json"], "keine angesammelten Tempdateien oder Volumes");
});

test("TTL, beschädigter Cache, Größenüberschreitung und Abschalten sind harmlose Cache-Misses", async () => {
  const file = join(directory, "adr-rule-cache.json");
  await writeFile(file, JSON.stringify([{ key: scope + key(1), rules, usedAt: Date.now() - RULE_CACHE_TTL_MS, expiresAt: Date.now() - 1 }]));
  assert.equal(await accessRuleCache(scope, key(1)), null);
  assert.deepEqual(await readdir(directory), []);
  await writeFile(file, "broken JSON");
  assert.equal(await accessRuleCache(scope, key(1)), null);
  await writeFile(file, "x".repeat(RULE_CACHE_MAX_BYTES + 1));
  assert.equal(await accessRuleCache(scope, key(1)), null);
  await accessRuleCache(scope, key(1), rules);
  process.env.ADR_RULE_CACHE = "0";
  try { assert.equal(await accessRuleCache(scope, key(1)), null); }
  finally { delete process.env.ADR_RULE_CACHE; }
});

test("aktiver Lock wird respektiert, nach Prozessabbruch wird der alte Lock ohne Dateiansammlung aufgeräumt", async () => {
  const lock = join(directory, "adr-rule-cache.json.lock");
  await mkdir(lock);
  const owner = "12345678-1234-1234-1234-123456789abc";
  await writeFile(join(lock, owner), "");
  assert.equal(await accessRuleCache(scope, key(1)), null);
  assert.deepEqual(await readdir(lock), [owner]);
  const old = new Date(Date.now() - 600_000);
  await utimes(lock, old, old);
  assert.deepEqual(await accessRuleCache(scope, key(1)), rules);
  assert.equal(await stat(lock).catch(() => null), null);
});

test("Cache-Endpunkt verlangt Review-Token, laufenden Review und begrenzte Regelpakete", async () => {
  const { POST } = await import("../../src/app/api/reviews/[id]/rule-cache/route");
  const review = makeReview();
  review.status = "running";
  await saveReview(review);
  const context = { params: Promise.resolve({ id: review.id }) };
  const request = (value: unknown, token = review.callbackToken) => new Request("http://localhost/rule-cache", {
    method: "POST", headers: { authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(value),
  });
  assert.equal((await POST(request({ key: key(4) }, "wrong"), context)).status, 401);
  assert.equal((await POST(request({ key: "../escape", rules }), context)).status, 400);
  assert.equal((await POST(request({ key: key(4), rules: [{ ...rules[0], text: "x".repeat(100_000) }] }), context)).status, 413);
  assert.equal((await POST(request({ key: key(4), rules }), context)).status, 200);
  const hit = await POST(request({ key: key(4) }), context);
  assert.deepEqual(await hit.json(), { rules });
  review.status = "completed";
  await saveReview(review);
  assert.equal((await POST(request({ key: key(4) }), context)).status, 409);
});
