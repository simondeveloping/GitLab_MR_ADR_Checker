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
    const key = `${finding.rule.origin}:${finding.rule.adrFile}`;
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
export function renderComment(
  review: Review,
  findings: Finding[],
  baseUrl: string,
): string {
  const first = findings[0];
  const source = ruleSource(first);
  const lines: string[] = [];

  lines.push(
    `**Architekturkonformität: ${findings.length === 1 ? "1 Befund" : `${findings.length} Befunde`}** — \`${source}\``,
  );
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

    // Sprungmarke auf die Karte dieses Befunds: dort stehen die vollständige
    // Belegkette und das Werkzeugprotokoll, die im Kommentar bewusst fehlen.
    lines.push(
      `[Belegkette und Werkzeugprotokoll ansehen](${reviewUrl(baseUrl, review.id, finding.id)})`,
    );
    lines.push("");
  }

  return lines.join("\n");
}

/** Der kurzlebige Hinweiskommentar während des Laufs (Abschnitt 7.2.1). */
export function renderPlaceholder(reviewId: string, baseUrl: string): string {
  return (
    `**Architekturkonformitäts-Review läuft.**\n\n` +
    `Der Merge Request wird gegen die Architecture Decision Records des Projekts geprüft. ` +
    `Dieser Hinweis verschwindet, sobald das Ergebnis vorliegt; der Merge wird davon nicht aufgehalten.\n\n` +
    `Der Lauf lässt sich währenddessen im Backend verfolgen: [Review öffnen](${reviewUrl(baseUrl, reviewId)})`
  );
}

/**
 * Abschlussmeldung am Merge Request. Sie wird nach jedem Lauf gesetzt, auch
 * wenn nichts zu melden war: Ohne sie wäre ein fehlgeschlagener Lauf von
 * einem sauberen nicht zu unterscheiden.
 *
 * Der Kommentar ist zugleich der einzige Einstiegspunkt in die Detailseite.
 * Am Merge Request selbst erscheinen nur Verstöße (NFA-10); die
 * eingehaltenen und die nicht entscheidbaren Regeln bleiben dort ungenannt,
 * wären ohne diesen Link aber auch nicht mehr auffindbar. Die Zählung nennt
 * sie deshalb, und der Link führt zu ihrer Begründung (NFA-3).
 */
export function renderSummary(review: Review, baseUrl: string): string {
  const findings = findingsOf(review);
  const counts = verdictCounts(findings);
  const violations = counts.NC;
  const url = reviewUrl(baseUrl, review.id);
  const lines: string[] = [];

  lines.push(
    violations === 0
      ? `**Architekturkonformität: keine Verstöße gefunden.**`
      : `**Architekturkonformität: ${violations === 1 ? "1 Verstoß" : `${violations} Verstöße`} gefunden.**`,
  );
  lines.push("");

  lines.push("| Urteil | Regeln |");
  lines.push("| --- | ---: |");
  lines.push(`| verletzt (NC) | ${violations} |`);
  lines.push(`| nicht entscheidbar (CIA) | ${counts.CIA} |`);
  lines.push(`| eingehalten (C) | ${counts.C} |`);
  lines.push(`| **geprüft** | **${findings.length}** |`);
  lines.push("");

  if (violations > 0) {
    lines.push(
      `${violations === 1 ? "Der Verstoß ist" : "Die Verstöße sind"} an der betroffenen Codestelle kommentiert.`,
    );
  }
  lines.push(
    `Eingehaltene und nicht entscheidbare Regeln werden hier bewusst nicht gemeldet. ` +
      `Sie stehen mitsamt Urteil, Begründung, Belegstelle und Werkzeugprotokoll im vollständigen Bericht:`,
  );
  lines.push("");
  lines.push(`**[Vollständigen Bericht öffnen](${url})**`);

  return lines.join("\n");
}
