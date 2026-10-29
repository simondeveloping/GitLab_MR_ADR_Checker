import Link from "next/link";
import {
  ArrowRight,
  GitMerge,
  RefreshCw,
  Search,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ReviewTable } from "@/components/review-table";
import { findingsOf, verdictCounts } from "@/lib/findings";
import { listReviews } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const reviews = await listReviews();
  const { q = "" } = await searchParams;
  const query = q.trim().toLocaleLowerCase("de-DE");
  const visibleReviews = query
    ? reviews.filter((review) =>
        [
          review.mr.projectPath,
          review.mr.sourceBranch,
          review.mr.targetBranch,
          review.status,
          `!${review.mr.mrIid}`,
        ]
          .join(" ")
          .toLocaleLowerCase("de-DE")
          .includes(query),
      )
    : reviews;
  const completed = reviews.filter((review) => review.status === "completed").length;
  const running = reviews.filter((review) => review.status === "running" || review.status === "queued").length;
  const totalViolations = reviews.reduce(
    (total, review) => total + verdictCounts(findingsOf(review)).NC,
    0,
  );

  return (
    <div className="reviews-page">
      <div className="breadcrumbs"><span>Reviews</span><span className="breadcrumb-slash">/</span><strong>Übersicht</strong></div>
      <section className="page-heading">
        <div>
          <div className="page-title-row"><div className="page-title-icon"><GitMerge size={20} /></div><h1>Merge Requests</h1></div>
        </div>
      </section>

      <section className="review-summary" aria-label="Review-Statistik">
        <div><strong>{reviews.length}</strong><span>Reviews gesamt</span></div>
        <div><strong>{completed}</strong><span>Abgeschlossen</span></div>
        <div><strong>{running}</strong><span>In Bearbeitung</span></div>
        <div><strong>{totalViolations}</strong><span>Verstöße gefunden</span></div>
      </section>

      <Card className="review-panel" id="reviews">
        <CardHeader className="review-panel-header">
          <div>
            <CardTitle>Letzte Reviews</CardTitle>
          </div>
          <div className="review-actions">
            <form className="search-field" action="/" role="search"><Search size={15} /><input name="q" aria-label="Reviews durchsuchen" placeholder="Reviews durchsuchen" defaultValue={q} /><button type="submit" className="sr-only">Suchen</button></form>
            <Button variant="outline" size="icon" aria-label="Filter zurücksetzen" title="Filter zurücksetzen" asChild><Link href="/"><RefreshCw size={15} /></Link></Button>
          </div>
        </CardHeader>

        {visibleReviews.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><GitMerge size={24} /></div>
            <h2>{query ? "Keine passenden Reviews" : "Keine Reviews vorhanden"}</h2>
            {query ? <Button variant="outline" asChild><Link href="/">Filter zurücksetzen <ArrowRight size={14} /></Link></Button> : null}
          </div>
        ) : (
          <ReviewTable reviews={visibleReviews} />
        )}
      </Card>

    </div>
  );
}
