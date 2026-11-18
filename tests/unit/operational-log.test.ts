import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pruneOperationalLogs } from "../../src/lib/operational-log";

const RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

test("Betriebslogs entfernen Einträge älter als 14 Tage, aber keine Review-Daten", async () => {
  const directory = await mkdtemp(join(tmpdir(), "adr-review-logs-"));
  try {
    const now = Date.now();
    const oldEntry = JSON.stringify({ ts: new Date(now - RETENTION_MS - 1).toISOString(), event: "old" });
    const recentEntry = JSON.stringify({ ts: new Date(now - RETENTION_MS + 1).toISOString(), event: "recent" });
    await writeFile(join(directory, "application.log"), `${oldEntry}\n${recentEntry}\n`);
    await writeFile(join(directory, "containers.log.1"), `${oldEntry}\n`);
    await writeFile(join(directory, "review.json"), "keep me");

    await pruneOperationalLogs(directory, now);

    assert.equal(await readFile(join(directory, "application.log"), "utf8"), `${recentEntry}\n`);
    assert.ok(!(await readdir(directory)).includes("containers.log.1"));
    assert.equal(await readFile(join(directory, "review.json"), "utf8"), "keep me");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Logs mit nicht auswertbarem Zeitstempel bleiben erhalten", async () => {
  const directory = await mkdtemp(join(tmpdir(), "adr-review-logs-"));
  try {
    const malformedLine = "not-json";
    await writeFile(join(directory, "application.log"), `${malformedLine}\n`);

    await pruneOperationalLogs(directory);

    assert.equal(await readFile(join(directory, "application.log"), "utf8"), `${malformedLine}\n`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
