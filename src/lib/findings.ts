/**
 * Auswertung der Befunde eines Reviews.
 *
 * Die Unterscheidung der drei Urteile trägt die gesamte Rückmeldung: Nur `NC`
 * erzeugt einen Kommentar am Merge Request, während `C` und `CIA` allein auf
 * der Detailseite erscheinen (Abschnitt 7.3, NFA-10). Weil diese Zählung an
 * mehreren Stellen zugleich gebraucht wird — im Kommentartext, bei der
 * Veröffentlichung und in der Oberfläche —, steht sie hier einmal und nicht
 * viermal.
 */

import type { Finding, Review, Verdict } from "./types";

/** Die Befunde eines Reviews; vor dem Callback ist die Liste leer. */
export function findingsOf(review: Review): Finding[] {
  return review.result?.findings ?? [];
}

export function withVerdict(findings: Finding[], verdict: Verdict): Finding[] {
  return findings.filter((finding) => finding.verdict === verdict);
}

/**
 * Die meldepflichtigen Befunde. „Der Code widerspricht der Regel" und „es
 * wurde nichts gefunden" sind zwei verschiedene Sachverhalte; sie
 * zusammenzufassen erzeugt genau den Fehlalarm, an dem solche Werkzeuge ihre
 * Akzeptanz verlieren (Abschnitt 6.5).
 */
export function violations(review: Review): Finding[] {
  return withVerdict(findingsOf(review), "NC");
}

/** Verteilung der Urteile über alle geprüften Regeln. */
export function verdictCounts(findings: Finding[]): Record<Verdict, number> {
  const counts: Record<Verdict, number> = { C: 0, NC: 0, CIA: 0 };
  for (const finding of findings) counts[finding.verdict] += 1;
  return counts;
}
