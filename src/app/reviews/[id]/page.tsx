import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { FindingCard } from "@/components/reviews/finding-card";
import { ReviewStats } from "@/components/reviews/review-stats";
import { getReview } from "@/lib/store";
import { findingsOf, VERDICT_LABEL, VERDICT_ORDER, withVerdict } from "@/lib/findings";
import { loadFindingDiffs, type ReviewDiffHunk } from "@/lib/review-diff";
import ReviewProgress from "./ReviewProgress";

export const dynamic = "force-dynamic";

export default async function ReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const review = await getReview(id);
  if (!review) notFound();

  const result = review.result;
  const findings = findingsOf(review);
  const feedbackByFinding = new Map(review.feedback?.map((entry) => [entry.findingId, entry]));
  let diffHunksByFinding = new Map<string, ReviewDiffHunk[]>();
  if (result && findings.length > 0) {
    try {
      diffHunksByFinding = await loadFindingDiffs(review);
    } catch {
      // Der gespeicherte Bericht bleibt bei temporären GitLab-Fehlern lesbar.
    }
  }

  return (
    <>
      <p className="meta"><Link href="/"><ArrowLeft size={14} aria-hidden="true" /> alle Reviews</Link></p>
      <h1>{review.mr.projectPath} !{review.mr.mrIid}</h1>
      <p className="subtitle"><a href={review.mr.webUrl}>In GitLab öffnen <ArrowUpRight size={14} aria-hidden="true" /></a></p>

      <ReviewProgress
        key={`${review.id}:${review.status}`}
        reviewId={review.id}
        initial={{ status: review.status, progress: review.sandboxProgress }}
      />
      <ReviewStats review={review} />

      {result ? (
        <>
          {result.mode === "architecture" ? (
            <div className="adr-source-link">
              <span>{`${result.adrFiles.length} Projekt-/Gruppen-ADR${result.adrFiles.length === 1 ? "" : "s"} als Regelbasis`}</span>
              <Link href="/group-adrs">Gruppen-ADRs ansehen <ArrowUpRight size={14} /></Link>
            </div>
          ) : null}
          {VERDICT_ORDER.map((verdict) => {
            const group = withVerdict(findings, verdict);
            if (group.length === 0) return null;
            return (
              // Verstöße bleiben für Sprungmarken aus GitLab direkt sichtbar.
              <details key={verdict} open={verdict === "NC"}>
                <summary className="section-toggle">
                  {result.mode === "learning" && verdict === "NC"
                    ? `Lernhinweise (${group.length})`
                    : `${VERDICT_LABEL[verdict]} (${group.length})`}
                </summary>
                {group.map((finding) => (
                  <FindingCard
                    key={finding.id}
                    finding={finding}
                    diffHunks={diffHunksByFinding.get(finding.id) ?? []}
                    reviewId={review.id}
                    initialFeedback={feedbackByFinding.get(finding.id)}
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
