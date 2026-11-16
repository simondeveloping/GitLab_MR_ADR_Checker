import { GitMerge } from "lucide-react";
import { ReviewsBrowser } from "@/components/reviews-browser";
import { listReviews } from "@/lib/store";
import { summarizeReview } from "@/lib/reviews";

export const dynamic = "force-dynamic";

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const [reviews, params] = await Promise.all([listReviews(), searchParams]);
  const { q = "", status = "all" } = params;
  const selectedStatus = status === "completed" || status === "active" ? status : "all";
  return (
    <div className="reviews-page">
      <div className="breadcrumbs"><span>Reviews</span><span className="breadcrumb-slash">/</span><strong>Übersicht</strong></div>
      <section className="page-heading">
        <div>
          <div className="page-title-row"><div className="page-title-icon"><GitMerge size={20} /></div><h1>Merge Requests</h1></div>
        </div>
      </section>

      <ReviewsBrowser
        key={`${selectedStatus}:${q ?? ""}`}
        reviews={reviews.map(summarizeReview)}
        initialQuery={q}
        initialStatus={selectedStatus}
      />
    </div>
  );
}
