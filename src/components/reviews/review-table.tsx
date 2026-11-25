"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUpDown, ArrowUpRight, CircleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { REVIEW_STATUS_LABEL, reviewModePresentation, type ReviewSummary } from "@/lib/reviews/summary";
import type { Review } from "@/lib/types";

type SortKey = "mr" | "status" | "checks" | "createdAt";
type SortDirection = "asc" | "desc";

const STATUS_VARIANT = {
  completed: "success",
  failed: "destructive",
  running: "default",
  queued: "secondary",
} as const satisfies Record<Review["status"], string>;

function SortableHeading({ label, column, current, direction, onSort }: {
  label: string;
  column: SortKey;
  current: SortKey;
  direction: SortDirection;
  onSort: (column: SortKey) => void;
}) {
  const active = current === column;
  const nextDirection = active
    ? direction === "asc" ? "desc" : "asc"
    : column === "createdAt" ? "desc" : "asc";
  const Icon = active ? ArrowDown : ArrowUpDown;
  return (
    <button className={`table-sort${active ? " is-active" : ""}`} onClick={() => onSort(column)} aria-label={`Nach ${label} ${nextDirection === "asc" ? "aufsteigend" : "absteigend"} sortieren`}>
      <span>{label}</span><Icon size={14} className={active && direction === "asc" ? "sort-icon-ascending" : undefined} aria-hidden="true" />
    </button>
  );
}

function highlightMatches(text: string, query: string): ReactNode {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return text;

  const escapedQuery = trimmedQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escapedQuery})`, "gi"));
  return parts.map((part, index) => part.toLocaleLowerCase("de-DE") === trimmedQuery.toLocaleLowerCase("de-DE")
    ? <mark className="search-highlight" key={`${index}-${part}`}>{part}</mark>
    : part);
}

export function ReviewTable({ reviews, highlightQuery = "" }: { reviews: ReviewSummary[]; highlightQuery?: string }) {
  const [sortBy, setSortBy] = useState<SortKey>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const sortedReviews = useMemo(() => [...reviews].sort((a, b) => {
    let comparison = 0;
    if (sortBy === "mr") {
      comparison = `${a.mr.projectPath} !${a.mr.mrIid}`.localeCompare(`${b.mr.projectPath} !${b.mr.mrIid}`, "de");
    } else if (sortBy === "status") {
      comparison = a.status.localeCompare(b.status, "de");
    } else if (sortBy === "checks") {
      comparison = a.checks - b.checks;
    } else {
      comparison = a.createdAt.localeCompare(b.createdAt);
    }
    return sortDirection === "asc" ? comparison : -comparison;
  }), [reviews, sortBy, sortDirection]);

  function toggleSort(column: SortKey) {
    if (sortBy === column) {
      setSortDirection((direction) => direction === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortDirection(column === "createdAt" ? "desc" : "asc");
    }
  }

  return (
    <div className="review-table-wrap">
      <Table className="review-table">
        <caption className="sr-only">Letzte Merge-Request-Reviews mit Status und Prüfergebnis</caption>
        <colgroup>
          <col className="review-column-mr" />
          <col className="review-column-status" />
          <col className="review-column-checks" />
          <col className="review-column-mode" />
          <col className="review-column-date" />
          <col className="review-column-action" />
        </colgroup>
        <TableHeader>
          <TableRow>
            {([
              ["mr", "Merge Request"],
              ["status", "Status"],
              ["checks", "Regeln geprüft"],
            ] as const).map(([column, label]) => (
              <TableHead key={column} aria-sort={sortBy === column ? sortDirection === "asc" ? "ascending" : "descending" : "none"}>
                <SortableHeading label={label} column={column} current={sortBy} direction={sortDirection} onSort={toggleSort} />
              </TableHead>
            ))}
            <TableHead>Modus</TableHead>
            <TableHead aria-sort={sortBy === "createdAt" ? sortDirection === "asc" ? "ascending" : "descending" : "none"}>
              <SortableHeading label="Erstellt" column="createdAt" current={sortBy} direction={sortDirection} onSort={toggleSort} />
            </TableHead>
            <TableHead><span className="sr-only">Öffnen</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedReviews.map((review) => {
            const counts = review.verdicts;
            const mode = reviewModePresentation(review);
            return (
              <TableRow key={review.id}>
                <TableCell>
                  <div className="mr-main">
                    <span className="mr-project" title={review.mr.projectPath}>{highlightMatches(review.mr.projectPath, highlightQuery)}</span>
                    <Link className="mr-title" href={`/reviews/${review.id}`} title={review.mr.title}>{highlightMatches(review.mr.title, highlightQuery)} <span className="mr-number">{highlightMatches(`!${review.mr.mrIid}`, highlightQuery)}</span></Link>
                  </div>
                </TableCell>
                <TableCell><div className="status-cell"><Badge variant={STATUS_VARIANT[review.status]}>{REVIEW_STATUS_LABEL[review.status]}</Badge>{review.error ? <span className="row-error" title={review.error}><CircleAlert size={13} /></span> : null}</div></TableCell>
                <TableCell>
                  {review.hasResult ? (
                    <div className="checks-cell"><span>{review.checks}</span><span className="check-breakdown"><span className={`count-nc${counts.NC === 0 ? " is-clear" : " is-violation"}`}>{counts.NC} Verstöße</span></span></div>
                  ) : <span className="muted-dash">—</span>}
                </TableCell>
                <TableCell className="mode-cell">
                  {mode ? (
                    <span className="mode-label" aria-label={mode.ariaLabel}>
                      <span>{mode.label}</span>
                      {mode.detail ? <span className="mode-enhancement">{mode.detail}</span> : null}
                    </span>
                  ) : <span className="muted-dash">—</span>}
                </TableCell>
                <TableCell className="date-cell">{formatDate(review.createdAt)}</TableCell>
                <TableCell><a className="row-open" href={review.mr.webUrl} target="_blank" rel="noreferrer" aria-label={`${review.mr.title} in GitLab öffnen`} title="In GitLab öffnen"><ArrowUpRight size={16} /></a></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <div className="table-footer"><span>{sortedReviews.length} {sortedReviews.length === 1 ? "Review" : "Reviews"}</span></div>
    </div>
  );
}
