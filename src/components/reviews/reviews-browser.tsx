"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight, GitMerge, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ReviewTable } from "./review-table";
import { isActiveReview, type ReviewSummary } from "@/lib/reviews/summary";

type StatusFilter = "all" | "completed" | "active";

function filterHref(status: StatusFilter, query: string): string {
  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  if (query) params.set("q", query);
  const search = params.toString();
  return search ? `/?${search}` : "/";
}

export function ReviewsBrowser({
  reviews,
  initialQuery,
  initialStatus,
}: {
  reviews: ReviewSummary[];
  initialQuery: string;
  initialStatus: StatusFilter;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [isRefreshing, startRefresh] = useTransition();
  const completedCount = reviews.filter((review) => review.status === "completed").length;
  const activeCount = reviews.filter((review) => isActiveReview(review.status)).length;
  const normalizedQuery = query.trim().toLocaleLowerCase("de-DE");
  const visibleReviews = reviews.filter((review) => {
    const matchesStatus = initialStatus === "all"
      || (initialStatus === "completed" && review.status === "completed")
      || (initialStatus === "active" && isActiveReview(review.status));
    const matchesQuery = !normalizedQuery || [
      review.mr.title,
      review.mr.projectPath,
      `!${review.mr.mrIid}`,
    ].join(" ").toLocaleLowerCase("de-DE").includes(normalizedQuery);
    return matchesStatus && matchesQuery;
  });

  return (
    <Card className="review-panel" id="reviews">
      <CardHeader className="review-panel-header">
        <nav className="review-filter-tabs" aria-label="Reviews nach Status filtern">
          <Link className="review-filter-tab" aria-current={initialStatus === "all" ? "page" : undefined} href={filterHref("all", query)}>Alle <span>{reviews.length}</span></Link>
          <Link className="review-filter-tab" aria-current={initialStatus === "completed" ? "page" : undefined} href={filterHref("completed", query)}>Abgeschlossen <span>{completedCount}</span></Link>
          <Link className="review-filter-tab" aria-current={initialStatus === "active" ? "page" : undefined} href={filterHref("active", query)}>In Bearbeitung <span>{activeCount}</span></Link>
        </nav>
        <div className="review-actions">
          <form className="search-field" role="search" onSubmit={(event) => {
            event.preventDefault();
            router.replace(filterHref(initialStatus, query.trim()));
          }}>
            <Search size={15} aria-hidden="true" />
            <input
              aria-label="Merge Requests durchsuchen"
              placeholder="Merge Requests durchsuchen"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </form>
          <Button
            variant="outline"
            size="icon"
            aria-label="Merge Requests aktualisieren"
            title="Merge Requests aktualisieren"
            disabled={isRefreshing}
            onClick={() => startRefresh(() => router.refresh())}
          >
            <RefreshCw size={15} className={isRefreshing ? "spin" : undefined} />
          </Button>
        </div>
      </CardHeader>

      {visibleReviews.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><GitMerge size={24} /></div>
          <h2>{normalizedQuery || initialStatus !== "all" ? "Keine passenden Reviews" : "Keine Reviews vorhanden"}</h2>
          {normalizedQuery || initialStatus !== "all" ? (
            <Button variant="outline" onClick={() => {
              setQuery("");
              router.replace("/");
            }}>Filter zurücksetzen <ArrowRight size={14} /></Button>
          ) : null}
        </div>
      ) : (
        <ReviewTable reviews={visibleReviews} highlightQuery={query} />
      )}
    </Card>
  );
}
