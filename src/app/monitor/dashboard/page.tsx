import Link from "next/link";
import { Activity, CheckCircle2, GitMerge, Hash } from "lucide-react";
import { DashboardCharts, type DashboardDay } from "@/components/monitor/dashboard-charts";
import { listReviews } from "@/lib/store";
import type { Review } from "@/lib/types";

export const dynamic = "force-dynamic";

function reviewTokenBreakdown(review: Review): { prompt: number; completion: number } {
  const stats = review.result?.stats;
  if ((stats?.promptTokens ?? 0) + (stats?.completionTokens ?? 0) > 0) {
    return { prompt: stats?.promptTokens ?? 0, completion: stats?.completionTokens ?? 0 };
  }

  return (review.result?.adrTokenUsage ?? []).reduce(
    (total, usage) => ({ prompt: total.prompt + usage.promptTokens, completion: total.completion + usage.completionTokens }),
    (review.result?.findings ?? []).reduce(
      (total, finding) => ({
        prompt: total.prompt + (finding.tokenUsage?.promptTokens ?? 0),
        completion: total.completion + (finding.tokenUsage?.completionTokens ?? 0),
      }),
      { prompt: 0, completion: 0 },
    ),
  );
}

function reviewTokenCount(review: Review): number {
  const statsTotal = review.result?.stats.totalTokens;
  if (typeof statsTotal === "number" && statsTotal > 0) return statsTotal;
  const { prompt, completion } = reviewTokenBreakdown(review);
  return prompt + completion;
}

function reviewHasFailures(review: Review): boolean {
  return review.status === "failed" || Boolean(review.error) ||
    review.sandboxProgress?.phase === "error" || review.sandboxProgress?.phase === "timeout";
}

const integerFormat = new Intl.NumberFormat("de-DE");
const compactFormat = new Intl.NumberFormat("de-DE", { notation: "compact", maximumFractionDigits: 1 });

export default async function MonitorDashboardPage() {
  const reviews = await listReviews(Number.MAX_SAFE_INTEGER);
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const firstDay = new Date(today);
  firstDay.setUTCDate(firstDay.getUTCDate() - 29);

  const chartData: DashboardDay[] = Array.from({ length: 30 }, (_, index) => {
    const day = new Date(firstDay);
    day.setUTCDate(day.getUTCDate() + index);
    const date = day.toISOString().slice(0, 10);
    return {
      date,
      label: new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(day),
      reviews: 0,
      failed: 0,
      promptTokens: 0,
      completionTokens: 0,
    };
  });
  const dayByDate = new Map(chartData.map((day) => [day.date, day]));

  for (const review of reviews) {
    const startedDay = dayByDate.get(review.createdAt.slice(0, 10));
    if (startedDay) startedDay.reviews += 1;

    if (reviewHasFailures(review) && startedDay) startedDay.failed += 1;

    const tokenDate = review.result?.stats.finishedAt ?? review.updatedAt;
    const tokenDay = dayByDate.get(tokenDate.slice(0, 10));
    if (tokenDay) {
      const usage = reviewTokenBreakdown(review);
      tokenDay.promptTokens += usage.prompt;
      tokenDay.completionTokens += usage.completion;
    }
  }

  const totalTokens = reviews.reduce((sum, review) => sum + reviewTokenCount(review), 0);
  const completedReviews = reviews.filter((review) => review.status === "completed").length;
  const runningReviews = reviews.filter((review) => review.status === "running" || review.status === "queued").length;
  const failedReviews = reviews.filter(reviewHasFailures).length;
  const averageTokens = reviews.length ? Math.round(totalTokens / reviews.length) : 0;

  return (
    <>
      <div className="breadcrumbs"><Link href="/">Merge Requests</Link><span className="breadcrumb-slash">/</span><strong>Monitor</strong><span className="breadcrumb-slash">/</span><strong>Dashboard</strong></div>
      <section className="page-heading">
        <div>
          <div className="page-title-row"><div className="page-title-icon"><Activity size={20} /></div><h1>Dashboard</h1></div>
          <p className="page-description">Übersicht über Review-Aktivität und Token-Verbrauch</p>
        </div>
      </section>

      <section className="dashboard-metrics" aria-label="Kennzahlen">
        <h2>Kennzahlen</h2>
        <div className="dashboard-metrics-panel">
          <div className="dashboard-metric-row">
            <span className="dashboard-metric-label"><GitMerge size={14} /><span>Merge Requests gesamt</span></span>
            <strong>{integerFormat.format(reviews.length)}</strong>
          </div>
          <div className="dashboard-metric-row dashboard-metric-status">
            <span className="dashboard-metric-label"><CheckCircle2 size={14} /><span>Review-Status</span></span>
            <div className="dashboard-status-values">
              <div className="dashboard-status-value is-completed"><span>Abgeschlossen</span><strong>{integerFormat.format(completedReviews)}</strong></div>
              <div className="dashboard-status-value is-failed"><span>Fehlgeschlagen</span><strong>{integerFormat.format(failedReviews)}</strong></div>
              <div className="dashboard-status-value is-running"><span>In Bearbeitung</span><strong>{integerFormat.format(runningReviews)}</strong></div>
            </div>
          </div>
          <div className="dashboard-metric-row">
            <span className="dashboard-metric-label"><Hash size={14} /><span>Tokens gesamt</span></span>
            <strong title={integerFormat.format(totalTokens)}>{compactFormat.format(totalTokens)}</strong>
          </div>
          <div className="dashboard-metric-row">
            <span className="dashboard-metric-label"><Activity size={14} /><span>Tokens pro Review</span></span>
            <strong title={integerFormat.format(averageTokens)}>{compactFormat.format(averageTokens)}</strong>
          </div>
        </div>
      </section>

      <main className="dashboard-main"><DashboardCharts data={chartData} /></main>
    </>
  );
}
