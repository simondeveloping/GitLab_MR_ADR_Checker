/** Auswahl und Diffanker ausschließlich für den lernfreundlichen Bug-Review. */
import type { LearningChunk, LearningFile } from "./learning-diff.js";

export interface LearningAnchor { path: string; line: number; side?: "old" }
export interface LearningChanges { added: Map<string, Set<number>>; removed: Map<string, Set<number>> }

export function learningChanges(files: LearningFile[]): LearningChanges {
  const changes: LearningChanges = { added: new Map(), removed: new Map() };
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
export function learningChunkChanges(chunk: LearningChunk): LearningChanges {
  const changes: LearningChanges = { added: new Map(), removed: new Map() };
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

export function learningAnchor(value: Record<string, unknown>, changes: LearningChanges): LearningAnchor | null {
  if (typeof value.path !== "string" || typeof value.line !== "number" || !Number.isSafeInteger(value.line) ||
    value.line < 1 || (value.side !== undefined && value.side !== "old")) return null;
  const path = value.path.trim().replace(/^\.\//, "");
  const side = value.side as "old" | undefined;
  if (!(side === "old" ? changes.removed : changes.added).get(path)?.has(value.line)) return null;
  return { path, line: value.line, ...(side ? { side } : {}) };
}

export interface LearningIntegrationSignal {
  incomplete: boolean;
  integrationNeeded: boolean;
  interfaces: string[];
  openQuestions: string[];
  relatedPaths: string[];
}

/** Nur kleine, vollständig untersuchte lokale Änderungen dürfen die zweite Suche sparen. */
export function learningIntegrationReason(
  files: LearningFile[], chunks: LearningChunk[], signals: LearningIntegrationSignal[], mode: "auto" | "always",
): "always" | "multiple_parts" | "incomplete" | "interfaces" | "broad_change" | "local_complete" {
  if (mode === "always") return "always";
  if (chunks.length !== 1 || files.length !== 1) return "multiple_parts";
  if (signals.length !== chunks.length || signals.some((signal) => signal.incomplete)) return "incomplete";
  if (signals.some((signal) => signal.integrationNeeded || signal.interfaces.length || signal.openQuestions.length ||
    signal.relatedPaths.some((path) => path !== files[0].path))) return "interfaces";

  const changed = files[0].hunks.flatMap((hunk) => hunk.lines.filter((line) => line.kind !== " "));
  // Konfigurations-/Vertragsdateien sowie sichtbare Schnittstellenänderungen konservativ behandeln.
  const sourceFile = /\.(?:[cm]?[jt]sx?|py|go|rs|java|kt|cs|rb|php|swift|c|cc|cpp|h|hpp)$/i.test(files[0].path);
  const boundaryPath = /(?:^|[/_.-])(?:api|routes?|schema|migration|config|settings|middleware|auth|contract|types)(?:[/_.-]|$)/i;
  const boundaryCode = /\b(?:export|import|require|public|protected|interface|class|struct|trait|def|func|fn|function|async|await|fetch|request|response|route|router|schema|migrate|process\.env)\b|module\.exports|@(Get|Post|Put|Delete)\b|=>/;
  if (!sourceFile || boundaryPath.test(files[0].path) || files[0].oldPath !== files[0].path ||
    !files[0].hunks.some((hunk) => hunk.lines.some((line) => line.newLine !== undefined)) ||
    changed.some((line) => boundaryCode.test(line.text))) return "interfaces";
  if (changed.length > 40 || Buffer.byteLength(chunks[0].diff) > 8_000) return "broad_change";
  return "local_complete";
}
