/**
 * Schritt 3 der Pipeline: Regelextraktion (Abschnitt 7.2.2, FA-1 und FA-2).
 *
 * Ein ADR ist kein Prüfkriterium, sondern ein Dokument. Es begründet eine
 * Entscheidung, wägt Alternativen ab und benennt Konsequenzen, und es enthält
 * dabei in aller Regel mehrere Festlegungen, die im Code an verschiedenen
 * Stellen sichtbar werden. Ein einziges Urteil über ein solches Dokument wäre
 * bedeutungslos, da es mehrere Sachverhalte zugleich meinen könnte und sich
 * weder belegen noch bestreiten ließe.
 *
 * Vorgeschaltet ist deshalb ein eigener Modellaufruf, der jedes ausgewählte
 * ADR in einzeln entscheidbare Regeln zerlegt. Jede so entstandene Regel ist
 * ein imperativer Satz mit genau einer Aussage und führt den Titel ihres
 * Herkunfts-ADR mit. Die Prüfeinheit ist danach nicht das Dokument und nicht
 * der Merge Request, sondern das Paar aus einer Regel und einem Codestand.
 *
 * Der Schritt löst zugleich ein zweites Problem: Ein ADR enthält Textteile,
 * die für Menschen wesentlich, für ein prüfendes Modell aber schädlich
 * sind, allen voran die Abwägung verworfener Alternativen. Solcher
 * Distraktor-Kontext beeinträchtigt die Schlussfolgerungsfähigkeit von
 * Sprachmodellen messbar, und verworfene Optionen sind besonders heikel, weil
 * sie meist implizit verneint werden. Die Extraktion beseitigt beides in einem
 * Zug: Was nicht Teil der getroffenen Entscheidung ist, wird nicht zur Regel.
 */

import { randomUUID } from "node:crypto";
import { config } from "./config.js";
import { mapWithConcurrency } from "./concurrency.js";
import { complete, parseJsonObject } from "./llm.js";
import type { AdrDocument } from "./rulebase.js";
import { log, withUsageScope } from "./trace.js";
import type { AdrTokenUsage, AgentFailure, Rule } from "./types.js";

const SYSTEM_PROMPT = `Du zerlegst ein Architecture Decision Record (ADR) in einzeln pruefbare Regeln fuer einen konkreten Merge Request.

AUFGABE
Gib ausschliesslich die Festlegungen wieder, die das Dokument tatsaechlich TRIFFT
UND die fuer die geaenderten Dateien dieses Merge Requests plausibel relevant
sind.

EINE REGEL IST:
- ein imperativer Satz mit genau EINER Aussage,
- am Quellcode oder an Konfigurationsdateien ueberpruefbar,
- fuer sich allein verstaendlich, ohne den Rest des Dokuments.

NICHT ZUR REGEL WERDEN:
- verworfene Alternativen und Abwaegungen ("Considered Options", "Alternativen"),
- Begruendungen, Vor- und Nachteile, Konsequenzen,
- Absichtserklaerungen ohne pruefbaren Gehalt ("wir wollen wartbaren Code"),
- Verweise auf Migrationstickets oder zeitliche Plaene,
- Festlegungen, deren Gegenstand mit keiner geaenderten Datei plausibel zu tun
  hat.

RELEVANZ
- Nutze die geaenderten Dateipfade als harte Vorauswahl.
- Waehle eine Regel nur, wenn Dateiname, Verzeichnis, Technologie oder
  Artefakttyp einen Bezug erkennen lassen.
- Im Zweifel darf eine Regel aufgenommen werden, aber erzeuge keine vollstaendige
  Regelbasis fuer das ganze Projekt.

Eine Festlegung, die mehrere Sachverhalte zugleich meint, wird in mehrere
Regeln zerlegt. Formuliere die Regel positiv oder als klares Verbot, aber
niemals als Verneinung einer verworfenen Alternative.

ANTWORTFORMAT
Ausschliesslich JSON, ohne Rahmentext:
{"rules": ["...", "..."]}
Gibt es keine pruefbare Festlegung, antworte {"rules": []}.`;

/**
 * Entfernt die Sektionen, die für Menschen wesentlich, für das prüfende
 * Modell aber Distraktor sind. Das Modell sieht sie damit gar nicht erst.
 * Im Repository bleibt das vollständige, standardkonforme MADR erhalten.
 */
const DISTRACTOR_HEADINGS =
  /^#{1,6}\s*(considered options|betrachtete optionen|alternativen|pros and cons|vor- und nachteile|more information|weitere informationen|links)\b/i;

export function stripDistractorSections(markdown: string): string {
  const lines = markdown.split("\n");
  const kept: string[] = [];
  let skipDepth = 0;

  for (const line of lines) {
    const heading = /^(#{1,6})\s/.exec(line);
    if (heading) {
      const depth = heading[1].length;
      if (skipDepth > 0 && depth <= skipDepth) skipDepth = 0;
      if (skipDepth === 0 && DISTRACTOR_HEADINGS.test(line)) {
        skipDepth = depth;
        continue;
      }
    }
    if (skipDepth === 0) kept.push(line);
  }

  return kept.join("\n").trim();
}

export interface ExtractionResult {
  rules: Rule[];
  failures: AgentFailure[];
  adrTokenUsage: AdrTokenUsage[];
}

async function extractDocument(
  document: AdrDocument,
  changedFiles: string[],
): Promise<ExtractionResult> {
  const { result, usage } = await withUsageScope(async () => {
    const prepared = stripDistractorSections(document.content);
    const changedFileList = changedFiles.slice(0, 200).join("\n") || "(keine)";

    let parsed: { rules?: unknown } | null = null;
    try {
      const completion = await complete(
        [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content:
              `Geaenderte Dateien (${changedFiles.length}):\n${changedFileList}\n\n` +
              `ADR-Titel: ${document.title}\nADR-Datei: ${document.file}\n\n${prepared}`,
          },
        ],
        { jsonOnly: true },
      );
      parsed = parseJsonObject<{ rules?: unknown }>(completion.content);
    } catch (error) {
      return {
        rules: [],
        failures: [
          {
            stage: "extract" as const,
            message: `${document.file}: ${(error as Error).message}`,
          },
        ],
      };
    }

    // Nicht formatgerechte Antworten werden verworfen und als Fehlschlag
    // protokolliert, statt als leeres Ergebnis durchzugehen (NFA-2).
    if (!parsed || !Array.isArray(parsed.rules)) {
      return {
        rules: [],
        failures: [
          {
            stage: "extract" as const,
            message: `${document.file}: Antwort nicht formatgerecht, Dokument übersprungen.`,
          },
        ],
      };
    }

    const rules: Rule[] = [];
    for (const raw of parsed.rules) {
      if (typeof raw !== "string") continue;
      const text = raw.trim();
      if (text.length < 10) continue;

      rules.push({
        id: randomUUID(),
        text,
        adrTitle: document.title,
        adrFile: document.file,
        origin: document.origin,
      });
    }

    log.info("rules_extracted", {
      file: document.file,
      count: parsed.rules.length,
    });

    return { rules, failures: [] };
  });

  return {
    ...result,
    adrTokenUsage: [
      {
        adrFile: document.file,
        adrTitle: document.title,
        extractedRules: result.rules.length,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
      },
    ],
  };
}

/** Zerlegt alle Dokumente der Regelbasis in atomare Regeln. */
export async function extractRules(
  documents: AdrDocument[],
  changedFiles: string[],
): Promise<ExtractionResult> {
  const results = await mapWithConcurrency(
    documents,
    config.concurrency.extraction,
    (document) => extractDocument(document, changedFiles),
  );

  return {
    rules: results.flatMap((result) => result.rules),
    failures: results.flatMap((result) => result.failures),
    adrTokenUsage: results.flatMap((result) => result.adrTokenUsage),
  };
}
