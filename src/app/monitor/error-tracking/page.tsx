import Link from "next/link";
import { ArrowUpRight, CircleAlert, FileWarning, GitMerge } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listReviews } from "@/lib/store";
import type { AgentFailure } from "@/lib/types";

export const dynamic = "force-dynamic";

const STAGE_LABEL: Record<AgentFailure["stage"], string> = {
  extract: "Regel-Extraktion",
  triage: "Vorfilter",
  locator: "Locator",
  reader: "Reader",
};

export default async function ErrorTrackingPage() {
  const reviews = await listReviews();
  const groups = reviews.flatMap((review) => {
    const issues: Array<{
      at: string;
      stage: string;
      message: string;
      severity: "error" | "warning";
    }> = [];

    const currentProgressError =
      review.sandboxProgress?.phase === "error" ||
      review.sandboxProgress?.phase === "timeout";
    if (review.error || currentProgressError) {
      issues.push({
        at: review.updatedAt,
        stage: currentProgressError ? "Containerfehler" : "Reviewfehler",
        message: review.error ?? review.sandboxProgress?.message ?? "Der Containerlauf ist fehlgeschlagen.",
        severity: "error",
      });
    }

    for (const failure of review.result?.failures ?? []) {
      issues.push({
        at: review.result?.stats.finishedAt ?? review.updatedAt,
        stage: STAGE_LABEL[failure.stage],
        message: failure.message,
        severity: "warning",
      });
    }
    if (issues.length === 0) return [];
    return [{ review, issues: issues.sort((a, b) => b.at.localeCompare(a.at)) }];
  }).sort((a, b) => b.review.updatedAt.localeCompare(a.review.updatedAt));
  const issueCount = groups.reduce((count, group) => count + group.issues.length, 0);

  return (
    <>
      <div className="breadcrumbs"><Link href="/">Merge Requests</Link><span className="breadcrumb-slash">/</span><Link href="/monitor/logs">Monitor</Link><span className="breadcrumb-slash">/</span><strong>Error Tracking</strong></div>
      <section className="page-heading">
        <div className="page-title-row"><div className="page-title-icon"><FileWarning size={20} /></div><h1>Error Tracking</h1></div>
      </section>
      <Card className="review-panel">
        <CardHeader className="review-panel-header"><CardTitle>Merge Requests mit Fehlern ({groups.length})</CardTitle></CardHeader>
        {issueCount === 0 ? (
          <div className="empty-state"><div className="empty-state-icon"><CircleAlert size={24} /></div><h2>Keine Fehler oder Warnungen</h2></div>
        ) : (
          <div className="issue-groups">
            {groups.map(({ review, issues }) => (
              <details className="issue-group" key={review.id}>
                <summary className="issue-group-header">
                  <span className="mr-icon"><GitMerge size={17} /></span>
                  <span className="issue-group-mr">
                    <span className="issue-group-title">{review.mr.title || `Merge Request !${review.mr.mrIid}`}</span>
                    <span className="issue-group-identity">{review.mr.projectPath} !{review.mr.mrIid} · {review.mr.sourceBranch} → {review.mr.targetBranch}</span>
                  </span>
                </summary>
                <Link className="issue-group-gitlab-link" href={review.mr.webUrl} target="_blank" rel="noreferrer">
                  In GitLab öffnen <ArrowUpRight size={15} />
                </Link>
                <div className="issue-list">
                  {issues.map((issue, index) => (
                    <CardContent className="issue-row" key={`${review.id}-${issue.stage}-${index}`}>
                      <span className={`issue-icon issue-icon-${issue.severity}`}><CircleAlert size={19} /></span>
                      <div className="issue-main">
                        <div className="issue-heading"><strong>{issue.stage}</strong><Badge variant={issue.severity === "error" ? "destructive" : "warning"}>{issue.severity === "error" ? "Fehler" : "Warnung"}</Badge></div>
                        <p>{issue.message}</p>
                        <div className="issue-meta"><span>{new Date(issue.at).toLocaleString("de-DE")}</span></div>
                      </div>
                    </CardContent>
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
