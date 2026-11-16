import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getReview, getReviewAfterPendingWrites, saveReview, updateReview } from "../../src/lib/store";
import { recordFeedback } from "../../src/lib/feedback";
import { makeReview } from "../fixtures";

let directory: string;
before(async () => {
  directory = await mkdtemp(join(tmpdir(), "adr-review-store-"));
  process.env.DATA_DIR = directory;
});
after(() => rm(directory, { recursive: true, force: true }));

test("parallele Updates erhalten alle Änderungen und lassen keine Temporärdateien zurück", async () => {
  await saveReview(makeReview("concurrent"));
  await Promise.all(Array.from({ length: 30 }, (_, index) => updateReview("concurrent", (review) => {
    review.feedback.push({ findingId: String(index), rating: "up", createdAt: review.createdAt });
  })));
  assert.equal((await getReviewAfterPendingWrites("concurrent"))?.feedback.length, 30);
  assert.ok((await readdir(join(directory, "reviews"))).every((file) => file.endsWith(".json")));
});

test("ein fehlgeschlagenes Update blockiert keine nachfolgenden Schreibvorgänge", async () => {
  await saveReview(makeReview("recovery"));
  await assert.rejects(updateReview("recovery", () => { throw new Error("test failure"); }));
  await updateReview("recovery", (review) => { review.status = "failed"; });
  assert.equal((await getReview("recovery"))?.status, "failed");
});

test("Feedback wird pro Befund ersetzt und parallele Bewertungen bleiben konsistent", async () => {
  await saveReview(makeReview("feedback"));
  await Promise.all([
    recordFeedback("feedback", "finding-1", "up"),
    recordFeedback("feedback", "finding-1", "down", "  geändert  "),
  ]);
  const entries = (await getReview("feedback"))!.feedback;
  assert.equal(entries.length, 1);
  assert.equal(entries[0].rating, "down");
  assert.equal(entries[0].comment, "geändert");
  const before = await getReview("feedback");
  assert.equal(await recordFeedback("feedback", "missing", "up"), "unknown finding");
  assert.deepEqual(await getReview("feedback"), before);
  assert.equal(await recordFeedback("missing", "finding-1", "up"), "unknown review");
});

test("Review-IDs können das Datenverzeichnis nicht verlassen", async () => {
  assert.equal(await getReview("../outside"), null);
  await assert.rejects(saveReview(makeReview("../outside")), /Ungültige Review-ID/);
});
