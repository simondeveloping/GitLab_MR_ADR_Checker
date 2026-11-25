/** Entscheidet, wann der Lernreview eine zusätzliche Integrationssuche benötigt. */
import type { ReviewChunk, ReviewFile } from "./review-diff.js";

export interface LearningIntegrationSignal {
  incomplete: boolean;
  integrationNeeded: boolean;
  interfaces: string[];
  openQuestions: string[];
  relatedPaths: string[];
}

/** Nur kleine, vollständig untersuchte lokale Änderungen dürfen die zweite Suche sparen. */
export function learningIntegrationReason(
  files: ReviewFile[], chunks: ReviewChunk[], signals: LearningIntegrationSignal[], mode: "auto" | "always",
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
