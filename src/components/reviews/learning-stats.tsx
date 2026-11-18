import { formatDuration } from "@/lib/format";
import type { LearningStats as Stats } from "@/lib/types";

const REASON: Record<Stats["integrationReason"], string> = {
  always: "Immer aktiviert",
  multiple_parts: "Mehrere Dateien oder Diffteile",
  incomplete: "Unvollständige Erstanalyse",
  interfaces: "Schnittstellenbezug oder offene Fragen",
  broad_change: "Umfangreiche Änderung",
  local_complete: "Entfallen: kleine, vollständig untersuchte lokale Änderung",
  no_changes: "Keine prüfbaren Änderungen",
};

export function LearningStats({ stats }: { stats: Stats }) {
  const incomplete = stats.incompleteUnits > 0 || stats.inconclusive > 0 || stats.verificationErrors > 0;
  return (
    <section className="review-timings" aria-label="Details des Lernreviews">
      <h2>Lernreview im Detail</h2>
      <p>{incomplete
        ? "Die Analyse ist teilweise offen. Veröffentlichte Hinweise sind bestätigt; weitere mögliche Fehler konnten nicht abschließend beurteilt werden."
        : "Die vorgesehenen Such- und Verifikationsaufgaben wurden abgeschlossen."}</p>
      <dl>
        <div><dt>Diffteile / geprüfte Kandidaten</dt><dd>{stats.chunks} / {stats.candidates}</dd></div>
        <div><dt>Kandidatensuche</dt><dd>{formatDuration(stats.collectionMs)}</dd></div>
        <div><dt>Integrationsprüfung</dt><dd>{formatDuration(stats.integrationMs)}</dd></div>
        <div><dt>Integrationsauswahl</dt><dd>{REASON[stats.integrationReason]}</dd></div>
        <div><dt>Verifikation und Kommentar</dt><dd>{formatDuration(stats.verificationMs)}</dd></div>
        <div><dt>Dublettenprüfung</dt><dd>{formatDuration(stats.deduplicationMs)}</dd></div>
        <div><dt>Bestätigt / widerlegt / offen / Prüfungsfehler</dt><dd>{stats.confirmed} / {stats.rejected} / {stats.inconclusive} / {stats.verificationErrors}</dd></div>
        <div><dt>Unvollständige Suchaufgaben</dt><dd>{stats.incompleteUnits}</dd></div>
      </dl>
      {stats.openIssues.length > 0 ? (
        <details>
          <summary>Offene Verdachtsfälle ({stats.inconclusive}; höchstens zehn Beispiele)</summary>
          <ul>{stats.openIssues.map((issue, index) => (
            <li key={index}><code>{issue.path}:{issue.line}{issue.side === "old" ? " (vorher)" : ""}</code> — {issue.reason}</li>
          ))}</ul>
        </details>
      ) : null}
    </section>
  );
}
