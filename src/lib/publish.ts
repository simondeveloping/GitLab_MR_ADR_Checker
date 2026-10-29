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

import { env } from "./env";
import {
  createFallbackComment,
  createInlineDiscussion,
  listMergeRequestDiffs,
} from "./gitlab";
import { groupByAdr, renderComment, renderSummary } from "./comment";
import { violations as violatedRules } from "./findings";
import type { Finding, Review } from "./types";

interface DiffTarget {
  newPath: string;
  oldPath: string;
  /** Zeilennummern im Zielstand, die im Diff auftauchen. */
  newLines: Set<number>;
}

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

/**
 * Liest aus den Diff-Hunks alle Zeilennummern des Zielstands heraus, die im
 * Diff sichtbar sind. Entfernte Zeilen zählen nicht mit, da sie im Zielstand
 * keine Position haben.
 */
function collectNewLines(diffText: string): Set<number> {
  const lines = new Set<number>();
  let cursor = 0;

  for (const line of diffText.split("\n")) {
    const header = HUNK_HEADER.exec(line);
    if (header) {
      cursor = Number(header[1]);
      continue;
    }
    if (cursor === 0) continue;

    if (line.startsWith("+")) {
      lines.add(cursor);
      cursor += 1;
    } else if (line.startsWith("-")) {
      // Zeile existiert im Zielstand nicht.
    } else if (line.startsWith("\\")) {
      // "\ No newline at end of file"
    } else {
      lines.add(cursor);
      cursor += 1;
    }
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
    if (!newPath || diff.deleted_file) continue;
    targets.set(newPath, {
      newPath,
      oldPath: String(diff.old_path ?? newPath),
      newLines: collectNewLines(String(diff.diff ?? "")),
    });
  }
  return targets;
}

/**
 * Sucht die erste Belegstelle eines Befunds, die auf einer im Diff
 * enthaltenen Zeile liegt.
 */
function findCommentablePosition(
  finding: Finding,
  targets: Map<string, DiffTarget>,
): { target: DiffTarget; line: number } | null {
  for (const evidence of finding.evidence) {
    const target = targets.get(evidence.path);
    if (!target) continue;
    for (let line = evidence.startLine; line <= evidence.endLine; line += 1) {
      if (target.newLines.has(line)) return { target, line };
    }
  }
  return null;
}

export interface PublishResult {
  published: Review["publishedComments"];
  reported: number;
  /** Diskussion des abschließenden Sammelkommentars mit dem Link zum Bericht. */
  summaryDiscussionId?: string;
}

/**
 * Platziert alle meldepflichtigen Befunde am Merge Request. Befunde mit dem
 * Urteil `C` oder `CIA` erzeugen bewusst keinen Kommentar; sie sind nur auf
 * der Detailseite des Backends sichtbar, sodass der Merge Request frei von
 * Rauschen bleibt (NFA-10).
 *
 * Damit diese Zurückhaltung die Nachvollziehbarkeit nicht aufhebt, schließt
 * jeder Lauf mit genau einem Sammelkommentar ab. Er nennt die Verteilung der
 * Urteile und verlinkt die Detailseite, über die auch die nicht gemeldeten
 * Regeln erreichbar bleiben (NFA-3).
 */
export async function publishFindings(review: Review): Promise<PublishResult> {
  const baseUrl = env.publicBaseUrl;
  const violations = violatedRules(review);

  if (violations.length === 0) {
    const summaryDiscussionId = await createFallbackComment(
      review.mr.projectId,
      review.mr.mrIid,
      renderSummary(review, baseUrl),
      review.mr.repoUrl,
    );
    return { published: [], reported: 0, summaryDiscussionId };
  }

  const targets = await loadDiffTargets(
    review.mr.projectId,
    review.mr.mrIid,
    review.mr.repoUrl,
  );
  const published: NonNullable<Review["publishedComments"]> = [];

  for (const [, findings] of groupByAdr(violations)) {
    const body = renderComment(review, findings, baseUrl);

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
            newLine: position.line,
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

  // Zuletzt, damit der Einstieg in den Bericht unter den Einzelbefunden steht.
  const summaryDiscussionId = await createFallbackComment(
    review.mr.projectId,
    review.mr.mrIid,
    renderSummary(review, baseUrl),
    review.mr.repoUrl,
  );

  return { published, reported: violations.length, summaryDiscussionId };
}
