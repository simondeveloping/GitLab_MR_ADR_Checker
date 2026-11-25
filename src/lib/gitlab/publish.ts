/**
 * Rückmeldung im Merge Request (Abschnitt 7.3).
 *
 * Eine Inline-Diskussion verlangt neben dem Text eine vollständige
 * Positionsangabe aus Datei-, Ausgangs- und Zielstand des Diffs. Deshalb wird
 * hier zuerst aus den MR-Diffs bestimmt, welche Zeilen überhaupt
 * kommentierbar sind. Lässt sich die Belegstelle keiner geänderten Zeile
 * zuordnen, fällt das System auf einen gewöhnlichen Kommentar am Merge
 * Request zurück.
 */

import {
  createFallbackComment,
  createInlineDiscussion,
  listMergeRequestDiffs,
} from "./client";
import { groupForComments, renderComment, renderSummary } from "./comment";
import { violations as violatedRules } from "../reviews/findings";
import type { Finding, Review } from "../types";

interface DiffTarget {
  newPath: string;
  oldPath: string;
  /** Tatsächlich hinzugefügte Zeilen im Zielstand. */
  newLines: Set<number>;
  oldLines?: Set<number>;
}

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * Liest nur hinzugefügte Zeilen aus den Diff-Hunks heraus.
 */
function collectChangedLines(diffText: string, side: "new" | "old"): Set<number> {
  const lines = new Set<number>();
  let cursor = 0;

  for (const line of diffText.split("\n")) {
    const header = HUNK_HEADER.exec(line);
    if (header) {
      cursor = Number(header[side === "old" ? 1 : 2]);
      continue;
    }
    if (cursor === 0) continue;

    if (line.startsWith("+")) {
      if (side === "new") { lines.add(cursor); cursor += 1; }
    } else if (line.startsWith("-")) {
      if (side === "old") { lines.add(cursor); cursor += 1; }
    } else if (line.startsWith("\\")) {
      // "\ No newline at end of file"
    } else cursor += 1;
  }

  return lines;
}

async function loadDiffTargets(
  projectId: number,
  mrIid: number,
  repoUrl: string,
): Promise<Map<string, DiffTarget>> {
  const diffs = await listMergeRequestDiffs(projectId, mrIid, repoUrl);

  const targets = new Map<string, DiffTarget>();
  for (const diff of diffs) {
    const newPath = String(diff.new_path ?? diff.old_path ?? "");
    if (!newPath) continue;
    const target = {
      newPath,
      oldPath: String(diff.old_path ?? newPath),
      newLines: collectChangedLines(String(diff.diff ?? ""), "new"),
      oldLines: collectChangedLines(String(diff.diff ?? ""), "old"),
    };
    targets.set(newPath, target);
    if (target.oldPath !== newPath) targets.set(target.oldPath, target);
  }
  return targets;
}

/**
 * Sucht die erste Belegstelle eines Befunds auf einer tatsächlich
 * hinzugefügten Zeile. Kontextzeilen sind keine MR-Änderungen.
 */
export function findCommentablePosition(
  finding: Finding,
  targets: Map<string, DiffTarget>,
): { target: DiffTarget; line: number; side?: "old" } | null {
  if (finding.anchor) {
    const target = targets.get(finding.anchor.path);
    const side = finding.anchor.side;
    return target && (side === "old" ? target.oldLines : target.newLines)?.has(finding.anchor.line)
      ? { target, line: finding.anchor.line, ...(side ? { side } : {}) } : null;
  }
  for (const evidence of finding.evidence) {
    const target = targets.get(evidence.path);
    if (!target) continue;
    for (let line = evidence.startLine; line <= evidence.endLine; line += 1) {
      if (evidence.revision === "base" ? target.oldLines?.has(line) : target.newLines.has(line)) {
        return { target, line, ...(evidence.revision ? { side: "old" as const } : {}) };
      }
    }
  }
  return null;
}

export interface PublishResult {
  published: Review["publishedComments"];
  reported: number;
  /** Diskussion des abschließenden Sammelkommentars. */
  summaryDiscussionId?: string;
}

/**
 * Platziert alle meldepflichtigen Befunde am Merge Request. Befunde mit dem
 * Urteil `C` oder `CIA` erzeugen bewusst keinen Kommentar; sie sind nur auf
 * der Detailseite des Backends sichtbar, sodass der Merge Request frei von
 * Rauschen bleibt (NFA-10).
 *
 * Architekturprüfungen mit Verstößen schließen mit einem Sammelkommentar ab,
 * der nur die Anzahl der Verstöße nennt.
 */
export async function publishFindings(review: Review): Promise<PublishResult> {
  const violations = violatedRules(review);
  const learning = review.result?.mode === "learning";

  if (violations.length === 0) {
    return { published: [], reported: 0 };
  }

  const targets = await loadDiffTargets(
    review.mr.projectId,
    review.mr.mrIid,
    review.mr.repoUrl,
  );
  const published: NonNullable<Review["publishedComments"]> = [];

  for (const [, findings] of groupForComments(violations)) {
    const body = renderComment(findings, review.mr);

    // Die Position richtet sich nach dem ersten Befund der Gruppe, der sich
    // überhaupt einer geänderten Zeile zuordnen lässt.
    let placed = false;
    if (review.mr.diffRefs) {
      for (const finding of findings) {
        const position = findCommentablePosition(finding, targets);
        if (!position) continue;

        const discussionId = await createInlineDiscussion(
          review.mr.projectId,
          review.mr.mrIid,
          body,
          review.mr.diffRefs,
          {
            newPath: position.target.newPath,
            oldPath: position.target.oldPath,
            ...(position.side === "old" ? { oldLine: position.line } : { newLine: position.line }),
          },
          review.mr.repoUrl,
        );

        if (discussionId) {
          for (const f of findings) {
            published.push({ findingId: f.id, kind: "inline", discussionId });
          }
          placed = true;
          break;
        }
      }
    }

    if (!placed) {
      const discussionId = await createFallbackComment(
        review.mr.projectId,
        review.mr.mrIid,
        body,
        review.mr.repoUrl,
      );
      for (const f of findings) {
        published.push({ findingId: f.id, kind: "fallback", discussionId });
      }
    }
  }

  // Lernmodus meldet ausschließlich einzelne Kommentare mit Verbesserung;
  // Architekturprüfungen erhalten zusätzlich einen kurzen Sammelkommentar.
  const summary = learning ? null : renderSummary(review);
  const summaryDiscussionId = summary === null
    ? undefined
    : await createFallbackComment(
        review.mr.projectId,
        review.mr.mrIid,
        summary,
        review.mr.repoUrl,
      );

  return { published, reported: violations.length, summaryDiscussionId };
}
