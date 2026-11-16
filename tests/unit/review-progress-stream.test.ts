import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { reviewProgressStream } from "../../src/lib/review-progress-stream";
import { saveReview, updateReview } from "../../src/lib/store";
import { makeReview } from "../fixtures";

let directory: string;
before(async () => {
  directory = await mkdtemp("/tmp/opencode/progress-stream-");
  process.env.DATA_DIR = directory;
});
after(() => rm(directory, { recursive: true, force: true }));

test("SSE liefert sofort den Stand, beobachtet atomare externe Updates und endet beim Abschluss", { timeout: 5000 }, async (t) => {
  const review = makeReview("stream");
  review.status = "running";
  await saveReview(review);
  const reader = reviewProgressStream(review, new AbortController().signal).getReader();
  t.after(() => reader.cancel());
  const first = new TextDecoder().decode((await reader.read()).value);
  assert.match(first, /"status":"running"/);
  assert.doesNotMatch(first, /private-callback-token|findings/);

  // Absichtlich nicht updateReview: simuliert einen anderen Worker/Prozess.
  const changed = reader.read();
  review.sandboxProgress = { phase: "judging", percent: 66, message: "2 von 4 bearbeitet", updatedAt: new Date().toISOString() };
  const file = join(directory, "reviews", "stream.json");
  await writeFile(`${file}.external`, JSON.stringify(review));
  await rename(`${file}.external`, file);
  assert.match(new TextDecoder().decode((await changed).value), /"percent":66/);

  const completed = reader.read();
  await updateReview(review.id, (stored) => { stored.status = "completed"; });
  assert.match(new TextDecoder().decode((await completed).value), /"status":"completed"/);
  assert.equal((await reader.read()).done, true);
});

test("Abbruch und bereits fehlgeschlagene Reviews schließen den Live-Kanal", { timeout: 5000 }, async () => {
  const review = makeReview("abort");
  review.status = "running";
  await saveReview(review);
  const controller = new AbortController();
  const reader = reviewProgressStream(review, controller.signal).getReader();
  await reader.read();
  controller.abort();
  assert.equal((await reader.read()).done, true);

  review.status = "failed";
  const failed = reviewProgressStream(review, new AbortController().signal).getReader();
  assert.match(new TextDecoder().decode((await failed.read()).value), /"status":"failed"/);
  assert.equal((await failed.read()).done, true);
});
