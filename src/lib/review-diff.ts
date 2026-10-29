import { listMergeRequestDiffs } from "./gitlab";
import type { Finding, Review } from "./types";

export interface ReviewDiffLine {
  kind: "context" | "added" | "removed";
  oldLine: number | null;
  newLine: number | null;
  text: string;
}

export interface ReviewDiffHunk {
  oldPath: string;
  newPath: string;
  header: string;
  lines: ReviewDiffLine[];
  omittedLines?: number;
}

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@.*$/;

function parseDiffHunks(
  oldPath: string,
  newPath: string,
  diff: string,
): ReviewDiffHunk[] {
  const hunks: ReviewDiffHunk[] = [];
  let current: ReviewDiffHunk | undefined;
  let oldLine = 0;
  let newLine = 0;

  for (const line of diff.split("\n")) {
    const header = HUNK_HEADER.exec(line);
    if (header) {
      current = { oldPath, newPath, header: line, lines: [] };
      hunks.push(current);
      oldLine = Number(header[1]);
      newLine = Number(header[2]);
      continue;
    }

    if (!current || line.startsWith("\\")) continue;

    if (line.startsWith("+")) {
      current.lines.push({
        kind: "added",
        oldLine: null,
        newLine,
        text: line.slice(1),
      });
      newLine += 1;
    } else if (line.startsWith("-")) {
      current.lines.push({
        kind: "removed",
        oldLine,
        newLine: null,
        text: line.slice(1),
      });
      oldLine += 1;
    } else if (line.startsWith(" ")) {
      current.lines.push({
        kind: "context",
        oldLine,
        newLine,
        text: line.slice(1),
      });
      oldLine += 1;
      newLine += 1;
    }
  }

  return hunks;
}

function linesForFinding(
  hunk: ReviewDiffHunk,
  finding: Finding,
): ReviewDiffLine[] {
  return hunk.lines.filter((line) => {
    if (line.kind === "context") return false;

    return finding.evidence.some((evidence) => {
      const matchesNewLine =
        line.newLine !== null &&
        evidence.path === hunk.newPath &&
        line.newLine >= evidence.startLine &&
        line.newLine <= evidence.endLine;
      const matchesOldLine =
        line.oldLine !== null &&
        evidence.path === hunk.oldPath &&
        line.oldLine >= evidence.startLine &&
        line.oldLine <= evidence.endLine;

      return matchesNewLine || matchesOldLine;
    });
  });
}

function compactHunk(
  hunk: ReviewDiffHunk,
  finding: Finding,
): ReviewDiffHunk | null {
  const relevant = linesForFinding(hunk, finding);
  if (relevant.length === 0) return null;

  // Positive and uncertain results need only a short sample of the code that
  // supports the decision. Violations retain every matched diff line.
  const limit = finding.verdict === "C" ? 3 : finding.verdict === "CIA" ? 6 : Infinity;
  const lines = relevant.slice(0, limit);

  return {
    ...hunk,
    lines,
    omittedLines: Math.max(0, relevant.length - lines.length),
  };
}

/** Lädt die tatsächlichen GitLab-Diff-Hunks, die die Belegstellen berühren. */
export async function loadFindingDiffs(
  review: Review,
): Promise<Map<string, ReviewDiffHunk[]>> {
  const diffs = await listMergeRequestDiffs(
    review.mr.projectId,
    review.mr.mrIid,
    review.mr.repoUrl,
  );
  const hunks = diffs.flatMap((file) => {
    const newPath = String(file.new_path ?? file.old_path ?? "");
    const oldPath = String(file.old_path ?? newPath);
    if (!newPath) return [];
    return parseDiffHunks(oldPath, newPath, String(file.diff ?? ""));
  });

  const byFinding = new Map<string, ReviewDiffHunk[]>();
  for (const finding of review.result?.findings ?? []) {
    const findingHunks = hunks.flatMap((hunk) => {
      const compact = compactHunk(hunk, finding);
      return compact ? [compact] : [];
    });
    byFinding.set(finding.id, findingHunks);
  }
  return byFinding;
}
