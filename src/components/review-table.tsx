"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUpDown, ArrowUpRight, CircleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { findingsOf, verdictCounts } from "@/lib/findings";
import type { Review } from "@/lib/types";

type SortKey = "mr" | "status" | "checks" | "createdAt";
type SortDirection = "asc" | "desc";

function statusBadge(status: Review["status"]) {
  switch (status) {
    case "completed":
      return <Badge variant="success">Abgeschlossen</Badge>;
    case "failed":
      return <Badge variant="destructive">Abgebrochen</Badge>;
    case "running":
      return <Badge variant="default">In Bearbeitung</Badge>;
    default:
      return <Badge variant="secondary">Warteschlange</Badge>;
  }
}

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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
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

export function ReviewTable({ reviews, highlightQuery = "" }: { reviews: Review[]; highlightQuery?: string }) {
  const [sortBy, setSortBy] = useState<SortKey>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const sortedReviews = useMemo(() => [...reviews].sort((a, b) => {
    let comparison = 0;
    if (sortBy === "mr") {
      comparison = `${a.mr.projectPath} !${a.mr.mrIid}`.localeCompare(`${b.mr.projectPath} !${b.mr.mrIid}`, "de");
    } else if (sortBy === "status") {
      comparison = a.status.localeCompare(b.status, "de");
    } else if (sortBy === "checks") {
      comparison = findingsOf(a).length - findingsOf(b).length;
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
          <col className="review-column-date" />
          <col className="review-column-action" />
        </colgroup>
        <TableHeader>
          <TableRow>
            <TableHead><SortableHeading label="Merge Request" column="mr" current={sortBy} direction={sortDirection} onSort={toggleSort} /></TableHead>
            <TableHead><SortableHeading label="Status" column="status" current={sortBy} direction={sortDirection} onSort={toggleSort} /></TableHead>
            <TableHead><SortableHeading label="Regeln geprüft" column="checks" current={sortBy} direction={sortDirection} onSort={toggleSort} /></TableHead>
            <TableHead><SortableHeading label="Erstellt" column="createdAt" current={sortBy} direction={sortDirection} onSort={toggleSort} /></TableHead>
            <TableHead><span className="sr-only">Öffnen</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedReviews.map((review) => {
            const findings = findingsOf(review);
            const counts = verdictCounts(findings);
            return (
              <TableRow key={review.id}>
                <TableCell>
                  <div className="mr-main">
                    <span className="mr-project" title={review.mr.projectPath}>{highlightMatches(review.mr.projectPath, highlightQuery)}</span>
                    <Link className="mr-title" href={`/reviews/${review.id}`} title={review.mr.title}>{highlightMatches(review.mr.title, highlightQuery)} <span className="mr-number">{highlightMatches(`!${review.mr.mrIid}`, highlightQuery)}</span></Link>
                  </div>
                </TableCell>
                <TableCell><div className="status-cell">{statusBadge(review.status)}{review.error ? <span className="row-error" title={review.error}><CircleAlert size={13} /></span> : null}</div></TableCell>
                <TableCell>
                  {review.result ? (
                    <div className="checks-cell"><span>{findings.length}</span><span className="check-breakdown"><span className={`count-nc${counts.NC === 0 ? " is-clear" : " is-violation"}`}>{counts.NC} Verstöße</span></span></div>
                  ) : <span className="muted-dash">—</span>}
                </TableCell>
                <TableCell className="date-cell">{formatDate(review.createdAt)}</TableCell>
                <TableCell><Link className="row-open" href={`/reviews/${review.id}`} aria-label={`Review ${review.mr.title} öffnen`}><ArrowUpRight size={16} /></Link></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <div className="table-footer"><span>{sortedReviews.length} {sortedReviews.length === 1 ? "Review" : "Reviews"}</span></div>
    </div>
  );
}
