/** Änderungszeilen und gültige Diffanker für beide Review-Modi. */
import type { ReviewChunk, ReviewFile } from "./review-diff.js";

export interface ReviewAnchor { path: string; line: number; side?: "old" }
export interface ReviewChanges { added: Map<string, Set<number>>; removed: Map<string, Set<number>> }

export function reviewChanges(files: ReviewFile[]): ReviewChanges {
  const changes: ReviewChanges = { added: new Map(), removed: new Map() };
  for (const file of files) {
    for (const line of file.hunks.flatMap((hunk) => hunk.lines)) {
      if (line.kind === " ") continue;
      const map = line.kind === "+" ? changes.added : changes.removed;
      const path = line.kind === "+" ? file.path : file.oldPath;
      const number = line.kind === "+" ? line.newLine : line.oldLine;
      if (!path || number === undefined) continue;
      if (!map.has(path)) map.set(path, new Set());
      map.get(path)!.add(number);
    }
  }
  return changes;
}

/** Ein Pfad allein reicht bei aufgeteilten Dateien nicht als Zugehörigkeitsprüfung. */
export function reviewChunkChanges(chunk: ReviewChunk): ReviewChanges {
  const changes: ReviewChanges = { added: new Map(), removed: new Map() };
  let path = "";
  let oldPath = "";
  for (const line of chunk.diff.split("\n")) {
    const header = /^Datei: ("(?:\\.|[^"\\])*") \(vorher: ("(?:\\.|[^"\\])*")\)/.exec(line);
    if (header) {
      path = JSON.parse(header[1]);
      oldPath = JSON.parse(header[2]);
      continue;
    }
    const added = /^alt:- neu:(\d+) \| \+/.exec(line);
    const removed = /^alt:(\d+) neu:- \| -/.exec(line);
    if (!added && !removed) continue;
    const map = added ? changes.added : changes.removed;
    const file = added ? path : oldPath;
    if (!file) continue;
    if (!map.has(file)) map.set(file, new Set());
    map.get(file)!.add(Number((added ?? removed)![1]));
  }
  return changes;
}

export function reviewAnchor(value: Record<string, unknown>, changes: ReviewChanges): ReviewAnchor | null {
  if (typeof value.path !== "string" || typeof value.line !== "number" || !Number.isSafeInteger(value.line) ||
    value.line < 1 || (value.side !== undefined && value.side !== "old")) return null;
  const path = value.path.trim().replace(/^\.\//, "");
  const side = value.side as "old" | undefined;
  if (!(side === "old" ? changes.removed : changes.added).get(path)?.has(value.line)) return null;
  return { path, line: value.line, ...(side ? { side } : {}) };
}
