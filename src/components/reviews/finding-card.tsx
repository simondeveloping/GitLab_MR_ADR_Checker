import { FindingFeedback } from "@/components/feedback/finding-feedback";
import { ruleSource } from "@/lib/comment";
import { VERDICT_LABEL } from "@/lib/findings";
import type { ReviewDiffHunk } from "@/lib/review-diff";
import type { FeedbackEntry, Finding } from "@/lib/types";

function DiffHunk({ hunk }: { hunk: ReviewDiffHunk }) {
  return (
    <section className="code-review-hunk">
      <div className="code-review-file">{hunk.newPath}</div>
      <div className="code-review-hunk-header">{hunk.header}</div>
      <div className="code-review-snippet">
        {hunk.omittedLines ? <div className="code-review-omitted">{hunk.omittedLines} weitere passende Zeilen ausgeblendet</div> : null}
        {hunk.lines.map((line, index) => (
          <div className={`code-review-line diff-${line.kind}`} key={`${line.oldLine}:${line.newLine}:${index}`}>
            <span className="code-review-number">{line.oldLine ?? ""}</span>
            <span className="code-review-number">{line.newLine ?? ""}</span>
            <span className="code-review-marker">{line.kind === "added" ? "+" : line.kind === "removed" ? "−" : ""}</span>
            <code>{line.text || " "}</code>
          </div>
        ))}
      </div>
    </section>
  );
}

export function FindingCard({ finding, diffHunks, reviewId, initialFeedback }: {
  finding: Finding;
  diffHunks: ReviewDiffHunk[];
  reviewId: string;
  initialFeedback?: FeedbackEntry;
}) {
  const location = finding.evidence[0];
  return (
    <article className="finding-card" id={finding.id}>
      <div className="card-row">
        <a className="finding-location" href={`#${finding.id}`}>
          <code>{location
            ? `${location.path}:${location.startLine}${location.endLine !== location.startLine ? `-${location.endLine}` : ""}`
            : ruleSource(finding)}</code>
        </a>
        <span className={`badge badge-${finding.verdict}`}>
          {finding.rule.origin === "learning" ? "Lernhinweis" : `${finding.verdict} ${VERDICT_LABEL[finding.verdict]}`}
        </span>
      </div>

      {diffHunks.map((hunk, index) => <DiffHunk hunk={hunk} key={`${hunk.newPath}:${hunk.header}:${index}`} />)}
      {diffHunks.length === 0 ? <p className="finding-no-diff">Für diese Belegstelle wurde keine passende Zeile im MR-Diff gefunden.</p> : null}

      <div className="finding-description">
        <p className="finding-rule">{finding.rule.text}</p>
        <p className="finding-rationale">{finding.rationale}</p>
        {finding.consequence ? <p><strong>Mögliche Folge:</strong> {finding.consequence}</p> : null}
        {finding.suggestion ? <p><strong>Mögliche Verbesserung:</strong> {finding.suggestion}</p> : null}
        {finding.evidence.length > 0 ? (
          <ul className="finding-evidence">
            {finding.evidence.map((evidence, index) => <li key={index}>{evidence.why ?? `Belegstelle in ${evidence.path}`}</li>)}
          </ul>
        ) : null}
      </div>
      <FindingFeedback reviewId={reviewId} findingId={finding.id} initialFeedback={initialFeedback} />
    </article>
  );
}
