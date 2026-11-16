/**
 * Aufbereitung der Befunde zu Kommentartext (Abschnitt 7.2.5 und 7.3).
 *
 * Zwei Festlegungen dieses Moduls sind Messergebnisse und keine Geschmacksfrage:
 *
 * 1. Nur das Urteil `NC` erzeugt einen Kommentar. `C` und `CIA` werden
 *    protokolliert, aber nicht gemeldet. Der Judge-Prompt des
 *    Referenzverfahrens fasst "der Code widerspricht der Regel" und "es wurde
 *    nichts gefunden" unter einem Label zusammen; allein diese Anweisung
 *    erklärt 46 % des gemessenen Verfahrensunterschieds (Abschnitt 6.5).
 * 2. Jeder Kommentar führt seine Herkunft mit, etwa `[Global] 001-datenbank.md`,
 *    sodass sich unmittelbar ablesen lässt, ob eine projektspezifische
 *    Entscheidung oder eine Vorgabe des Gruppenstandards betroffen ist.
 */

import { findingsOf, verdictCounts } from "./findings";
import type { Finding, Review } from "./types";

export function originLabel(finding: Finding): string {
  if (finding.rule.origin === "learning") return "Lernmodus";
  return finding.rule.origin === "group" ? "Global" : "Projekt";
}

/**
 * Adresse der Detailseite eines Reviews, optional mit Sprungmarke auf einen
 * einzelnen Befund. Die Detailseite vergibt die Befund-ID als Anker, sodass
 * ein Kommentar unmittelbar auf die zugehörige Karte zeigen kann.
 */
export function reviewUrl(
  baseUrl: string,
  reviewId: string,
  findingId?: string,
): string {
  const url = `${baseUrl}/reviews/${reviewId}`;
  return findingId ? `${url}#${findingId}` : url;
}

/** Kurzkennung der Regelherkunft, die in jedem Kommentar auftaucht. */
export function ruleSource(finding: Finding): string {
  if (finding.rule.origin === "learning") return "[Lernmodus]";
  return `[${originLabel(finding)}] ${finding.rule.adrFile}`;
}

/**
 * Gruppiert die Befunde nach dem ADR, aus dem ihre Regel stammt. Ein ADR mit
 * mehreren verletzten Regeln erzeugt damit einen zusammenhängenden Kommentar
 * statt mehrerer verstreuter.
 */
export function groupByAdr(findings: Finding[]): Map<string, Finding[]> {
  const groups = new Map<string, Finding[]>();
  for (const finding of findings) {
    const key = finding.rule.origin === "learning"
      ? `learning:${finding.id}`
      : `${finding.rule.origin}:${finding.rule.adrFile}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(finding);
    else groups.set(key, [finding]);
  }
  return groups;
}

/**
 * Kommentartext für eine Gruppe von Befunden desselben ADR.
 *
 * Der Text schlägt von sich aus die Brücke zwischen Codestelle und
 * offizieller Dokumentation: Wer den Befund nicht versteht, findet die
 * Begründung im ADR, aus dem die Regel stammt (NFA-11).
 */
export function renderComment(findings: Finding[]): string {
  const first = findings[0];
  if (first.rule.origin === "learning") {
    const lines = [`**${first.rule.text}**`, "", first.rationale.trim()];
    if (first.consequence) {
      lines.push("", `**Mögliche Folge:** ${first.consequence.trim()}`);
    }
    if (first.suggestion) {
      lines.push("", `**Verbesserung:** ${first.suggestion.trim()}`);
    }
    return lines.join("\n");
  }

  const source = ruleSource(first);
  const lines: string[] = [];

  lines.push(`**Architekturkonformität: ${findings.length === 1 ? "1 Befund" : `${findings.length} Befunde`}** — \`${source}\``);
  lines.push("");
  lines.push(`Betroffene Architekturentscheidung: **${first.rule.adrTitle}**`);
  lines.push("");

  for (const finding of findings) {
    lines.push(`---`);
    lines.push("");
    lines.push(`> ${finding.rule.text}`);
    lines.push("");
    lines.push(finding.rationale.trim());
    lines.push("");

    if (finding.evidence.length > 0) {
      lines.push("Belegstellen:");
      for (const evidence of finding.evidence) {
        lines.push(
          `- \`${evidence.path}:${evidence.startLine}-${evidence.endLine}\`` +
            (evidence.why ? ` — ${evidence.why}` : ""),
        );
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

/** Der kurzlebige Hinweiskommentar während des Laufs (Abschnitt 7.2.1). */
export function renderPlaceholder(reviewId: string, baseUrl: string): string {
  return (
    `Der Agent wurde gestartet und ist gleich fertig.\n\n` +
    `[Review öffnen](${reviewUrl(baseUrl, reviewId)})`
  );
}

/**
 * Abschlussmeldung am Merge Request. Sie wird nach jedem Lauf gesetzt, auch
 * wenn nichts zu melden war: Ohne sie wäre ein fehlgeschlagener Lauf von
 * einem sauberen nicht zu unterscheiden.
 *
 * Der Kommentar nennt nur die Anzahl der Verstöße; die Details zu den
 * einzelnen Befunden stehen in deren jeweiligen Kommentaren.
 */
export function renderSummary(review: Review): string {
  const violations = verdictCounts(findingsOf(review)).NC;
  if (violations === 0) return "Es wurden keine Verstöße gefunden.";
  if (violations === 1) return "Es wurde 1 Verstoß gefunden.";
  return `Es wurden ${violations} Verstöße gefunden.`;
}
