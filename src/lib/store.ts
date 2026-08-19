/**
 * Ablage der Reviews.
 *
 * Bewusst ein Verzeichnis mit einer JSON-Datei je Review statt einer Datenbank:
 * Der Prototyp soll nachvollziehbar sein (NFA-3), und ein Protokoll, das sich
 * mit `cat` lesen lässt, dient diesem Zweck besser als ein Binärformat.
 * Schreibzugriffe laufen über eine prozessweite Serialisierung je Review-ID,
 * damit der Callback und der Sandbox-Watchdog sich nicht überschreiben.
 */

import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { env } from "./env";
import type { Review } from "./types";

function reviewsDir(): string {
  return resolve(process.cwd(), env.dataDir, "reviews");
}

function reviewPath(id: string): string {
  return join(reviewsDir(), `${id}.json`);
}

/** Verhindert, dass zwei gleichzeitige Updates einander verlieren. */
const locks = new Map<string, Promise<unknown>>();

function withLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(id) ?? Promise.resolve();
  const next = previous.then(fn, fn);
  locks.set(
    id,
    next.catch(() => undefined),
  );
  return next;
}

export function newReviewId(): string {
  return randomUUID();
}

export async function saveReview(review: Review): Promise<void> {
  await mkdir(reviewsDir(), { recursive: true });
  const target = reviewPath(review.id);
  // Erst in eine Temporärdatei, dann umbenennen: ein abgebrochener Schreibvorgang
  // hinterlässt so kein halbes JSON.
  const tmp = `${target}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(review, null, 2), "utf8");
  await rename(tmp, target);
}

export async function getReview(id: string): Promise<Review | null> {
  try {
    const raw = await readFile(reviewPath(id), "utf8");
    return JSON.parse(raw) as Review;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/**
 * Liest den Review, nachdem alle bereits angestoßenen Schreibvorgänge
 * durchgelaufen sind. Nötig, wo der Stand einer nebenläufigen Meldung zählt:
 * Der Callback aus der Sandbox und der Watchdog des Backends laufen in
 * getrennten Anfragen, und ein direkter `getReview` könnte den Datensatz
 * erwischen, bevor der Callback ihn geschrieben hat.
 */
export function getReviewAfterPendingWrites(
  id: string,
): Promise<Review | null> {
  return withLock(id, () => getReview(id));
}

/**
 * Lädt den Review, wendet `mutate` an und schreibt ihn zurück. Gibt `null`
 * zurück, wenn es den Review nicht gibt.
 */
export function updateReview(
  id: string,
  mutate: (review: Review) => void | Promise<void>,
): Promise<Review | null> {
  return withLock(id, async () => {
    const review = await getReview(id);
    if (!review) return null;
    await mutate(review);
    review.updatedAt = new Date().toISOString();
    await saveReview(review);
    return review;
  });
}

/** Alle Reviews, neueste zuerst. Für die Übersichtsseite. */
export async function listReviews(limit = 100): Promise<Review[]> {
  let files: string[];
  try {
    files = await readdir(reviewsDir());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const reviews: Review[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const review = await getReview(file.slice(0, -".json".length));
    if (review) reviews.push(review);
  }

  reviews.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return reviews.slice(0, limit);
}
