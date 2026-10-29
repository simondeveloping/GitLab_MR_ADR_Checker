import Link from "next/link";
import { ScrollText } from "lucide-react";
import { Card } from "@/components/ui/card";

export default function LogsPage() {
  return (
    <>
      <div className="breadcrumbs"><Link href="/">Merge Requests</Link><span className="breadcrumb-slash">/</span><strong>Monitor</strong><span className="breadcrumb-slash">/</span><strong>Logs</strong></div>
      <section className="page-heading">
        <div className="page-title-row"><div className="page-title-icon"><ScrollText size={20} /></div><h1>Logs</h1></div>
      </section>
      <Card className="review-panel">
        <div className="empty-state">
          <div className="empty-state-icon"><ScrollText size={24} /></div>
          <h2>Keine Logs verfügbar</h2>
          <p>Hier werden künftig die Anwendungslogs angezeigt.</p>
        </div>
      </Card>
    </>
  );
}
