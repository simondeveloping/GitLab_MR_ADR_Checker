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
 * 2. Jeder ADR-Kommentar führt seine Herkunft mit, etwa `[Global] 001-datenbank.md`,
 *    sodass sich unmittelbar ablesen lässt, ob eine projektspezifische
 *    Entscheidung oder eine Vorgabe des Gruppenstandards betroffen ist.
 */

import { findingsOf, verdictCounts } from "../reviews/findings";
import type { Evidence, Finding, MergeRequestContext, Review } from "../types";

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

/** Kurzkennung der Regelherkunft für ADR-Kommentare und die Befundanzeige. */
export function ruleSource(finding: Finding): string {
  if (finding.rule.origin === "learning") return "[Lernmodus]";
  return `[${originLabel(finding)}] ${finding.rule.adrFile}`;
}

/**
 * Lern- und Architekturbefunde einzeln platzieren: dieselbe ADR-Datei kann
 * unterschiedliche Codestellen und damit unterschiedliche Inline-Positionen betreffen.
 * Nur Einträge mit derselben Herkunft und Befund-ID bilden eine Kommentargruppe.
 */
export function groupForComments(findings: Finding[]): Map<string, Finding[]> {
  const groups = new Map<string, Finding[]>();
  for (const finding of findings) {
    const key = `${finding.rule.origin}:${finding.id}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(finding);
    else groups.set(key, [finding]);
  }
  return groups;
}

/** Verweist auf die konkrete Datei im geprüften Commit, bei Löschungen auf den Basisstand. */
function codeUrl(mr: MergeRequestContext, evidence: Evidence): string | null {
  const revision = evidence.revision === "base" ? mr.diffRefs?.base_sha : mr.sha;
  if (!revision || !evidence.path || evidence.path.startsWith("/") ||
    evidence.path.split("/").some((part) => !part || part === "." || part === "..")) return null;

  try {
    const url = new URL(mr.webUrl);
    const projectPath = url.pathname.match(/^(.*)\/-\/merge_requests\/\d+\/?$/)?.[1];
    if (!projectPath || !["http:", "https:"].includes(url.protocol)) return null;
    url.pathname = `${projectPath}/-/blob/${encodeURIComponent(revision)}/${evidence.path.split("/").map(encodeURIComponent).join("/")}`;
    url.search = "";
    url.hash = `L${evidence.startLine}`;
    return url.toString();
  } catch {
    return null;
  }
}

/** Zeigt alle überprüften Stellen, auch wenn ein Inline-Kommentar nicht möglich ist. */
function renderCodeLocations(finding: Finding, mr?: MergeRequestContext): string[] {
  const evidence = [...finding.evidence];
  if (finding.anchor && !evidence.some((item) => item.path === finding.anchor?.path &&
    item.revision === (finding.anchor.side === "old" ? "base" : undefined) &&
    item.startLine <= finding.anchor.line && item.endLine >= finding.anchor.line)) {
    evidence.unshift({ path: finding.anchor.path, startLine: finding.anchor.line, endLine: finding.anchor.line,
      ...(finding.anchor.side === "old" ? { revision: "base" as const } : {}) });
  }
  if (evidence.length === 0) return [];

  return ["**Code-Stellen:**", ...evidence.map((item) => {
    const range = item.startLine === item.endLine ? `${item.startLine}` : `${item.startLine}-${item.endLine}`;
    const label = `${item.path}:${range}`;
    const url = mr ? codeUrl(mr, item) : null;
    // Pfade sind Dateinamen, kein vertrauenswürdiges Markdown aus dem Modell.
    const safeLabel = label.replace(/[\\`\[\]]/g, "\\$&");
    return `- ${url ? `[${safeLabel}](${url})` : `\`${safeLabel}\``}` +
      (item.revision === "base" ? " (vor der Änderung)" : "") +
      (item.why ? ` — ${item.why}` : "");
  }), ""];
}

/**
 * Kommentartext für eine von groupForComments gebildete Befundgruppe.
 *
 * Der Text schlägt von sich aus die Brücke zwischen Codestelle und
 * offizieller Dokumentation: Wer den Befund nicht versteht, findet die
 * Begründung im ADR, aus dem die Regel stammt (NFA-11).
 */
export function renderComment(findings: Finding[], mr?: MergeRequestContext): string {
  const first = findings[0];
  if (first.rule.origin === "learning") {
    const lines = [`**${first.rule.text}**`, "", first.rationale.trim()];
    if (first.consequence) {
      lines.push("", `**Mögliche Folge:** ${first.consequence.trim()}`);
    }
    if (first.suggestion) {
      lines.push("", `**Verbesserung:** ${first.suggestion.trim()}`);
    }
    const locations = renderCodeLocations(first, mr);
    if (locations.length > 0) lines.push("", ...locations);
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
    if (finding.rule.adrSource) {
      const { startLine, endLine, quote } = finding.rule.adrSource;
      lines.push(`**ADR-Grundlage:** \`${finding.rule.adrFile}:${startLine}-${endLine}\` — „${quote}“`, "");
    }
    lines.push(finding.rationale.trim());
    lines.push("");

    if (finding.consequence) lines.push(`**Mögliche Folge:** ${finding.consequence.trim()}`, "");
    if (finding.suggestion) lines.push(`**Verbesserung:** ${finding.suggestion.trim()}`, "");

    lines.push(...renderCodeLocations(finding, mr));
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
 * Abschlussmeldung am Merge Request nur bei Verstößen. Die Details zu den
 * einzelnen Befunden stehen in deren jeweiligen Kommentaren.
 */
export function renderSummary(review: Review): string | null {
  const violations = verdictCounts(findingsOf(review)).NC;
  if (violations === 0) return null;
  if (violations === 1) return "Es wurde 1 Verstoß gefunden.";
  return `Es wurden ${violations} Verstöße gefunden.`;
}
