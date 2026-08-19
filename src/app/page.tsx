import Link from "next/link";
import { findingsOf, verdictCounts } from "@/lib/findings";
import { listReviews } from "@/lib/store";
import type { Review } from "@/lib/types";

export const dynamic = "force-dynamic";

function statusBadge(status: Review["status"]): string {
  switch (status) {
    case "completed":
      return "badge badge-C";
    case "failed":
      return "badge badge-NC";
    default:
      return "badge badge-muted";
  }
}

export default async function ReviewsPage() {
  const reviews = await listReviews();

  return (
    <>
      <h1>Architekturkonformitäts-Reviews</h1>
      <p className="subtitle">
        Jeder Merge Request wird gegen die Architecture Decision Records seines
        Projekts geprüft. Am Merge Request erscheinen nur Verstöße; die
        eingehaltenen und die mangels Evidenz nicht entscheidbaren Regeln stehen
        hier.
      </p>

      {reviews.length === 0 ? (
        <p className="empty">
          Noch kein Review erfasst. Sobald in GitLab ein Merge Request geöffnet
          wird, erscheint er hier.
        </p>
      ) : (
        reviews.map((review) => {
          const findings = findingsOf(review);
          const counts = verdictCounts(findings);
          return (
            <div key={review.id} className="card">
              <div className="card-row">
                <strong>
                  <Link href={`/reviews/${review.id}`}>
                    {review.mr.projectPath} !{review.mr.mrIid}
                  </Link>
                </strong>
                <span className={statusBadge(review.status)}>
                  {review.status}
                </span>
              </div>
              <div>{review.mr.title}</div>
              <div className="meta">
                {new Date(review.createdAt).toLocaleString("de-DE")} ·{" "}
                {review.mr.sourceBranch} → {review.mr.targetBranch}
                {review.result ? (
                  <>
                    {" "}
                    · {findings.length} Regeln geprüft, {counts.NC}{" "}
                    Verstoß/Verstöße, {counts.CIA} nicht entscheidbar
                  </>
                ) : null}
              </div>
              {review.error ? (
                <div className="meta" style={{ color: "var(--nc)" }}>
                  {review.error}
                </div>
              ) : null}
            </div>
          );
        })
      )}
    </>
  );
}
