import { GitMerge, TriangleAlert } from "lucide-react";
import { ReviewsBrowser } from "@/components/reviews-browser";
import { findingsOf, verdictCounts } from "@/lib/findings";
import { listReviews } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const [reviews, params] = await Promise.all([listReviews(), searchParams]);
  const { q = "", status = "all" } = params;
  const selectedStatus = status === "completed" || status === "active" ? status : "all";
  const completed = reviews.filter((review) => review.status === "completed").length;
  const active = reviews.filter((review) => review.status === "running" || review.status === "queued").length;
  const totalViolations = reviews.reduce(
    (total, review) => total + verdictCounts(findingsOf(review)).NC,
    0,
  );

  return (
    <div className="reviews-page">
      <div className="breadcrumbs"><span>Reviews</span><span className="breadcrumb-slash">/</span><strong>Übersicht</strong></div>
      <section className="page-heading">
        <div>
          <div className="page-title-row"><div className="page-title-icon"><GitMerge size={20} /></div><h1>Merge Requests</h1><span className={`violation-summary${totalViolations > 0 ? " has-violations" : ""}`}><TriangleAlert size={13} aria-hidden="true" />{totalViolations} Verstöße</span></div>
        </div>
      </section>

      <ReviewsBrowser
        reviews={reviews}
        initialQuery={q}
        initialStatus={selectedStatus}
        completedCount={completed}
        activeCount={active}
      />
    </div>
  );
}
