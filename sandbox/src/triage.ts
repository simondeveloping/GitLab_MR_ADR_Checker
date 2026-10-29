/**
 * Schritt 4 der Pipeline: Vorauswahl der einschlägigen Regeln
 * (Abschnitt 7.2.3, FA-4).
 *
 * Vor der eigentlichen Analyse steht ein sehr kurzer Modellaufruf. Er sieht
 * ausschließlich die Liste der geänderten Dateipfade sowie die extrahierten
 * Regeln in Kurzform und entscheidet daraus, welche Regeln für diesen
 * Änderungssatz überhaupt in Frage kommen. Bei einer reinen Änderung am
 * Stylesheet fallen die Regeln zur Datenbankanbindung damit sofort heraus.
 *
 * Der Schritt spart nicht nur Modellaufrufe und Laufzeit, sondern senkt vor
 * allem die Zahl der Fehlalarme: Eine Regel, die nie geprüft wird, kann auch
 * nicht fälschlich als verletzt gemeldet werden.
 *
 * Die Schwäche des Zuschnitts ist offen zu benennen. Die Entscheidung fällt
 * allein auf Dateipfaden und damit auf einer sehr dünnen Grundlage, sodass
 * eine Regel verlorengehen kann, deren Verletzung sich in einer dem Namen nach
 * unverdächtigen Datei zeigt. Die Alternative wäre, sämtliche Regeln zu
 * prüfen, was Laufzeit proportional zur Größe der Regelbasis kostet und bei
 * einem organisationsweiten Regelsatz nicht mehr tragbar wäre. Der Fehler
 * wirkt zudem in Richtung des Übersehens und nicht in Richtung des
 * Fehlalarms, was für die Akzeptanz die verträglichere Richtung ist (NFA-10).
 */

import { complete, parseJsonObject } from "./llm.js";
import { log } from "./trace.js";
import type { AgentFailure, DroppedRule, Rule } from "./types.js";

const SYSTEM_PROMPT = `Du entscheidest, welche Architekturregeln fuer einen konkreten Aenderungssatz ueberhaupt in Frage kommen.

Du siehst NUR die geaenderten Dateipfade und die Regeln. Du siehst keinen Code.

WAEHLE EINE REGEL AUS, wenn die geaenderten Pfade es plausibel machen, dass die
Regel diesen Aenderungssatz betrifft. Im Zweifel WAEHLEN: Eine faelschlich
gepruefte Regel kostet nur Laufzeit, eine faelschlich verworfene laesst einen
Verstoss durchgehen.

VERWIRF EINE REGEL nur, wenn ihr Gegenstand mit keiner der geaenderten Dateien
etwas zu tun haben kann, etwa eine Regel ueber Datenbankmigrationen bei einer
reinen Aenderung an Stylesheets.

ANTWORTFORMAT
Ausschliesslich JSON, ohne Rahmentext:
{"selected": [0, 2, 5]}
Die Zahlen sind die Indizes der ausgewaehlten Regeln.`;

export interface TriageResult {
  selected: Rule[];
  dropped: DroppedRule[];
  failures: AgentFailure[];
}

export async function triage(
  rules: Rule[],
  changedFiles: string[],
): Promise<TriageResult> {
  if (rules.length === 0) {
    return { selected: [], dropped: [], failures: [] };
  }

  // Ohne geänderte prüfrelevante Dateien gibt es nichts zu prüfen.
  if (changedFiles.length === 0) {
    return {
      selected: [],
      dropped: rules.map((rule) => ({
        rule,
        reason: "Keine geänderten prüfrelevanten Dateien.",
      })),
      failures: [],
    };
  }

  const ruleList = rules
    .map((rule, index) => `${index}: [${rule.adrFile}] ${rule.text}`)
    .join("\n");

  let parsed: { selected?: unknown } | null = null;
  try {
    const completion = await complete(
      [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content:
            `Geaenderte Dateien (${changedFiles.length}):\n` +
            `${changedFiles.join("\n")}\n\n` +
            `Regeln:\n${ruleList}`,
        },
      ],
      { jsonOnly: true },
    );
    parsed = parseJsonObject<{ selected?: unknown }>(completion.content);
  } catch (error) {
    // Fällt der Vorfilter aus, wird lieber alles geprüft als etwas übersehen.
    return {
      selected: rules,
      dropped: [],
      failures: [
        {
          stage: "triage",
          message: `Vorfilter fehlgeschlagen (${(error as Error).message}), alle Regeln werden geprüft.`,
        },
      ],
    };
  }

  if (!parsed || !Array.isArray(parsed.selected)) {
    return {
      selected: rules,
      dropped: [],
      failures: [
        {
          stage: "triage",
          message:
            "Antwort des Vorfilters nicht formatgerecht, alle Regeln werden geprüft.",
        },
      ],
    };
  }

  const selectedIndices = new Set(
    parsed.selected
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 0 && value < rules.length),
  );

  const selected: Rule[] = [];
  const dropped: DroppedRule[] = [];
  for (let index = 0; index < rules.length; index += 1) {
    if (selectedIndices.has(index)) selected.push(rules[index]);
    else {
      dropped.push({
        rule: rules[index],
        reason: "Kein Bezug zu einer geänderten Datei erkennbar.",
      });
    }
  }

  log.info("triage_done", {
    total: rules.length,
    selected: selected.length,
    dropped: dropped.length,
  });

  return { selected, dropped, failures: [] };
}
