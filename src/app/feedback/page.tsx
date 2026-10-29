import Link from "next/link";
import { Frown, MessageSquareHeart, Meh, Smile } from "lucide-react";
import { FeedbackChart } from "@/components/feedback/feedback-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listReviews } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function FeedbackPage() {
  const reviews = await listReviews(Number.MAX_SAFE_INTEGER);
  const ratings = reviews.flatMap((review) => review.feedback ?? []);
  const positive = ratings.filter((entry) => entry.rating === "up").length;
  const negative = ratings.filter((entry) => entry.rating === "down").length;
  const total = positive + negative;
  const positiveShare = total ? Math.round((positive / total) * 100) : 0;

  const chartData = [
    { label: "Hilfreich", count: positive, color: "var(--chart-positive)" },
    { label: "Nicht hilfreich", count: negative, color: "var(--chart-negative)" },
  ];

  return (
    <>
      <div className="breadcrumbs"><Link href="/">Merge Requests</Link><span className="breadcrumb-slash">/</span><strong>Feedback</strong></div>
      <section className="page-heading">
        <div>
          <div className="page-title-row"><div className="page-title-icon"><MessageSquareHeart size={20} /></div><h1>Feedback</h1></div>
          <p className="page-description">Rückmeldungen zu den Review-Bemerkungen</p>
        </div>
      </section>

      <section className="feedback-summary" aria-label="Feedback-Übersicht">
        <div className="feedback-stat-item"><MessageSquareHeart size={16} /><strong>{total}</strong><span>Rückmeldungen gesamt</span></div>
        <div className="feedback-stat-item"><Smile size={16} /><strong>{positive}</strong><span>Hilfreich</span></div>
        <div className="feedback-stat-item"><Frown size={16} /><strong>{negative}</strong><span>Nicht hilfreich</span></div>
      </section>

      <Card className="feedback-chart-card">
        <CardHeader className="feedback-chart-header">
          <div>
            <CardTitle>Bewertung der Bemerkungen</CardTitle>
            <p className="ui-card-description">Anteil hilfreicher Rückmeldungen: {positiveShare} %</p>
          </div>
          <span className="feedback-chart-total"><Meh size={15} /> {total} {total === 1 ? "Bewertung" : "Bewertungen"}</span>
        </CardHeader>
        {total ? (
          <CardContent className="feedback-chart-content"><FeedbackChart data={chartData} /></CardContent>
        ) : (
          <div className="feedback-empty"><MessageSquareHeart size={22} /><p>Noch keine Rückmeldungen vorhanden.</p><span>Bewertungen zu einzelnen Review-Bemerkungen werden hier zusammengefasst.</span></div>
        )}
      </Card>
    </>
  );
}
