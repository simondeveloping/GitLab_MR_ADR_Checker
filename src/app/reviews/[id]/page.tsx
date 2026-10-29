/**
 * Detailseite eines Reviews (Abschnitt 7.3).
 *
 * Der Merge Request bleibt frei von Rauschen, weil dort nur Verstöße
 * erscheinen. Die Nachvollziehbarkeit bleibt trotzdem erhalten: Diese Seite
 * zeigt die geprüften Regeln mit Begründung und Belegstelle.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { getReview } from "@/lib/store";
import { ruleSource } from "@/lib/comment";
import { findingsOf, verdictCounts, withVerdict } from "@/lib/findings";
import { loadFindingDiffs } from "@/lib/review-diff";
import type { ReviewDiffHunk } from "@/lib/review-diff";
import type { Finding, Verdict } from "@/lib/types";
import { FindingFeedback } from "@/components/feedback/finding-feedback";
import ReviewProgress from "./ReviewProgress";

export const dynamic = "force-dynamic";

const VERDICT_LABEL: Record<Verdict, string> = {
  C: "eingehalten",
  NC: "verletzt",
  CIA: "nicht entscheidbar",
};

const VERDICT_ORDER: Verdict[] = ["NC", "CIA", "C"];

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.round(durationMs / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes} min ${seconds}s`;
}

function FindingCard({
  finding,
  diffHunks,
  reviewId,
  initialFeedback,
}: {
  finding: Finding;
  diffHunks: ReviewDiffHunk[];
  reviewId: string;
  initialFeedback?: import("@/lib/types").FeedbackEntry;
}) {
  return (
    <article className="finding-card" id={finding.id}>
      <div className="card-row">
        <a className="finding-location" href={`#${finding.id}`}>
          {finding.evidence[0] ? (
            <code>
              {finding.evidence[0].path}:{finding.evidence[0].startLine}
              {finding.evidence[0].endLine !== finding.evidence[0].startLine
                ? `-${finding.evidence[0].endLine}`
                : ""}
            </code>
          ) : (
            <code>{ruleSource(finding)}</code>
          )}
        </a>
        <span className={`badge badge-${finding.verdict}`}>
          {finding.verdict} · {VERDICT_LABEL[finding.verdict]}
        </span>
      </div>

      {diffHunks.map((hunk, hunkIndex) => (
        <section className="code-review-hunk" key={`${hunk.newPath}:${hunk.header}:${hunkIndex}`}>
          <div className="code-review-file">{hunk.newPath}</div>
          <div className="code-review-hunk-header">{hunk.header}</div>
          <div className="code-review-snippet">
            {hunk.omittedLines ? (
              <div className="code-review-omitted">
                {hunk.omittedLines} weitere passende Zeilen ausgeblendet
              </div>
            ) : null}
            {hunk.lines.map((line, lineIndex) => {
              const marker =
                line.kind === "added"
                  ? "+"
                  : line.kind === "removed"
                    ? "−"
                    : "";

              return (
                <div
                  className={`code-review-line diff-${line.kind}`}
                  key={`${line.oldLine ?? "-"}:${line.newLine ?? "-"}:${lineIndex}`}
                >
                  <span className="code-review-number">{line.oldLine ?? ""}</span>
                  <span className="code-review-number">{line.newLine ?? ""}</span>
                  <span className="code-review-marker">{marker}</span>
                  <code>{line.text || " "}</code>
                </div>
              );
            })}
          </div>
        </section>
      ))}
      {diffHunks.length === 0 ? (
        <p className="finding-no-diff">
          Für diese Belegstelle wurde keine passende Zeile im MR-Diff gefunden.
        </p>
      ) : null}

      <div className="finding-description">
        <p className="finding-rule">{finding.rule.text}</p>
        <p className="finding-rationale">{finding.rationale}</p>

        {finding.evidence.length > 0 ? (
          <ul className="finding-evidence">
            {finding.evidence.map((evidence, index) => (
              <li key={index}>
                {evidence.why ?? `Belegstelle in ${evidence.path}`}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <FindingFeedback reviewId={reviewId} findingId={finding.id} initialFeedback={initialFeedback} />
    </article>
  );
}

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const review = await getReview(id);
  if (!review) notFound();

  const result = review.result;
  const findings = findingsOf(review);
  const counts = verdictCounts(findings);
  let diffHunksByFinding = new Map<string, ReviewDiffHunk[]>();
  if (result && findings.length > 0) {
    try {
      diffHunksByFinding = await loadFindingDiffs(review);
    } catch {
      // Ein temporärer GitLab-Fehler soll den gespeicherten Review-Bericht
      // nicht unzugänglich machen.
    }
  }
  return (
    <>
      <p className="meta">
        <Link href="/">← alle Reviews</Link>
      </p>

      <h1>
        {review.mr.projectPath} !{review.mr.mrIid}
      </h1>
      <p className="subtitle">
        <a href={review.mr.webUrl}>In GitLab öffnen ↗</a>
      </p>

      <ReviewProgress
        reviewId={review.id}
        initial={{
          status: review.status,
          progress: review.sandboxProgress,
        }}
      />

      <div className="stats">
        <div>
          <span className="stat-label">Status</span>
          <span className="stat-value">
            {review.status === "completed"
              ? "Abgeschlossen"
              : review.status === "failed"
                ? "Fehlgeschlagen"
                : review.status === "running"
                  ? "In Prüfung"
                  : "Wartend"}
          </span>
        </div>
        <div>
          <span className="stat-label">Regelbasis</span>
          <span className="stat-value">
            {result?.ruleOrigin === "group"
              ? "Gruppenstandard"
              : result?.ruleOrigin === "project"
                ? "Projekt-ADRs"
                : "—"}
          </span>
        </div>
        <div>
          <span className="stat-label">Regeln geprüft</span>
          <span className="stat-value">{findings.length}</span>
        </div>
        <div>
          <span className="stat-label">Verstöße</span>
          <span className="stat-value" style={{ color: "var(--nc)" }}>
            {counts.NC}
          </span>
        </div>
        <div>
          <span className="stat-label">Nicht entscheidbar</span>
          <span className="stat-value" style={{ color: "var(--cia)" }}>
            {counts.CIA}
          </span>
        </div>
        <div>
          <span className="stat-label">Laufzeit</span>
          <span className="stat-value">
            {result ? formatDuration(result.stats.durationMs) : "—"}
          </span>
        </div>
      </div>

      {result ? (
        <>
          <div className="adr-source-link">
            <span>{result.adrFiles.length} ADR{result.adrFiles.length === 1 ? "" : "s"} als Regelbasis</span>
            {result.ruleOrigin === "group" ? <Link href="/group-adrs">Gruppen-ADRs ansehen <ArrowUpRight size={14} /></Link> : null}
          </div>

          {VERDICT_ORDER.map((verdict) => {
            const group = withVerdict(findings, verdict);
            if (group.length === 0) return null;
            return (
              // Verstöße stehen offen, weil sie den Anlass der Seite bilden
              // und die Sprungmarken aus den MR-Kommentaren auf sie zeigen. Die
              // übrigen Gruppen sind eingeklappt, bleiben aber einen Klick weit
              // entfernt (NFA-3).
              <details key={verdict} open={verdict === "NC"}>
                <summary className="section-toggle">
                  {VERDICT_LABEL[verdict]} ({group.length})
                </summary>
            {group.map((finding) => (
              <FindingCard
                key={finding.id}
                finding={finding}
                diffHunks={diffHunksByFinding.get(finding.id) ?? []}
                reviewId={review.id}
                initialFeedback={review.feedback?.find((entry) => entry.findingId === finding.id)}
              />
            ))}
              </details>
            );
          })}

        </>
      ) : null}

    </>
  );
}
