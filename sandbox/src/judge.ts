/**
 * Schritt 5 der Pipeline: Prüfung der Einzelregel (Abschnitt 7.2.4).
 *
 * Für jede verbliebene Regel läuft ein eigener, isolierter Prüfvorgang. Das
 * verhindert, dass sich mehrere Regeln im selben Kontext vermischen und das
 * Modell Vorgaben miteinander verwechselt.
 *
 * Der Aufbau entspricht unverändert dem in Kapitel 5 beschriebenen und in
 * Kapitel 6 vermessenen Verfahren (Abbildung 5.2):
 *
 *   Locator  - verfügt nur über die auffindenden Werkzeuge list_files und
 *              grep, navigiert iterativ durch den Quellbaum und meldet am Ende
 *              präzise Kandidatenstellen mit Pfad und Zeilenbereich. Er
 *              urteilt nicht.
 *   Reader   - verfügt ausschließlich über read_file, öffnet genau diese
 *              Stellen und fällt das Urteil. Reicht ihm die Evidenz nicht,
 *              löst das Programm eine gezielte Nachsuche aus, über die
 *              wiederum der Locator arbeitet. Die Nachsuche stößt der
 *              Orchestrierungs-Code an, nicht das Modell.
 *
 * Gewählt ist diese Bauart nicht als naheliegende, sondern als gemessene
 * Lösung: Abschnitt 6.3 weist ihr gegenüber einer vorab zusammengestellten
 * Kontextauswahl einen Vorsprung von 19,6 Prozentpunkten nach (p = 0,0042).
 * Entscheidend ist dabei nicht, dass der Agent mehr Material sichtet, sondern
 * dass er feststellen kann, wenn etwas NICHT vorhanden ist - was ein vorab
 * gefüllter Kontext grundsätzlich nicht leisten kann, weil er immer eine
 * Auswahl liefert.
 *
 * WERKZEUGBUDGET: Die Zahl der Werkzeugaufrufe je Regel ist nach oben
 * begrenzt, und die Ausschöpfung dieser Grenze wird als Unsicherheitssignal
 * gewertet statt als Anlass, weiterzusuchen (FA-7). Auch das ist ein
 * Messergebnis: Nach Abschnitt 6.6.2 gingen falsche Urteile mit MEHR
 * Werkzeugnutzung einher als richtige. Ein Agent, der lange sucht, hat die
 * Antwort typischerweise nicht gefunden, sondern sich in thematisch
 * Verwandtem verloren.
 */

import { randomUUID } from "node:crypto";
import { config } from "./config.js";
import { complete, parseJsonObject, type Message } from "./llm.js";
import {
  LOCATOR_TOOLS,
  READER_TOOLS,
  dispatch,
  type ToolContext,
} from "./tools.js";
import { log, withUsageScope } from "./trace.js";
import type { AgentFailure, Evidence, Finding, Rule, Verdict } from "./types.js";

const LOCATOR_SYSTEM = `Du bist der LOCATOR eines Architektur-Reviews. Du suchst Belegstellen. Du urteilst NICHT.

AUFGABE
Finde im Repository die Codestellen, an denen sich entscheiden laesst, ob die
vorgegebene Architekturregel eingehalten ist.

VORGEHEN
- Beginne mit list_files, um die Struktur zu verstehen.
- Suche dann gezielt mit grep nach den Begriffen, Bezeichnern, Importen oder
  Pfadmustern, um die es in der Regel geht.
- Suche auch nach dem Gegenteil: Wenn die Regel etwas verbietet, suche nach dem
  verbotenen Muster. Wenn sie etwas verlangt, suche nach Stellen, an denen es
  fehlen koennte.
- Der Aenderungssatz des Merge Requests liegt als Datei "${config.patchFile}" im
  Wurzelverzeichnis. Lies ihn ueber grep, um zu erfahren, was sich geaendert hat.
  Die Regel ist aber am Zustand des GESAMTEN Repositorys nach der Aenderung zu
  belegen, nicht nur an den geaenderten Zeilen.
- Der Suchraum umfasst ausdruecklich auch CI-, Build-, Linter- und
  Konfigurationsdateien. Ein erheblicher Teil von Architekturentscheidungen
  betrifft genau diese Artefakte.

ABSCHLUSS
Wenn du genug hast oder nichts mehr findest, antworte OHNE weiteren
Werkzeugaufruf ausschliesslich mit JSON:
{"candidates": [{"path": "...", "start_line": 12, "end_line": 40, "why": "..."}],
 "search_summary": "was du gesucht und was du gefunden bzw. nicht gefunden hast"}

Findest du nichts, ist {"candidates": [], "search_summary": "..."} die richtige
Antwort. Eine erfolglose Suche ist ein Ergebnis, kein Fehler - halte im
search_summary ausdruecklich fest, WONACH du erfolglos gesucht hast.`;

const READER_SYSTEM = `Du bist der READER eines Architektur-Reviews. Du liest die vom Locator gemeldeten Stellen und faellst das Urteil.

URTEILE (genau eines)
- "C"   Der Code haelt die Regel ein. Du hast die Stelle gesehen, die das belegt.
- "NC"  Der Code WIDERSPRICHT der Regel. Du hast die verletzende Stelle gesehen.
- "CIA" Die verfuegbare Evidenz reicht fuer keine der beiden Aussagen.

DIE WICHTIGSTE UNTERSCHEIDUNG
"Der Code widerspricht der Regel" und "ich habe nichts gefunden" sind ZWEI
VERSCHIEDENE SACHVERHALTE. Fehlende Evidenz ist NIEMALS ein Verstoss. Wenn du
die verletzende Stelle nicht konkret benennen kannst, lautet dein Urteil "CIA"
und nicht "NC". Nur "NC" fuehrt zu einer Meldung an die Entwickelnden; ein
Befund, der nur aus einer Evidenzluecke entsteht, ist genau der Fehlalarm, an
dem solche Werkzeuge ihre Akzeptanz verlieren.

BELEGPFLICHT
Jedes Urteil braucht eine Begruendung und eine konkrete Belegstelle mit Pfad
und Zeilenbereich. Auch ein "C" darf nicht ohne benannte Fundstelle ergehen.

VORRANG
Widerspricht die Regel allgemeinem Clean-Code-Wissen, hat die Regel Vorrang.
Du pruefst diese eine Regel und nichts sonst - andere Maengel im Code sind
nicht dein Gegenstand.

WERKZEUG
read_file oeffnet einen Zeilenbereich. Nutze es sparsam und gezielt.

ABSCHLUSS
Antworte OHNE weiteren Werkzeugaufruf ausschliesslich mit JSON:
{"verdict": "C" | "NC" | "CIA",
 "rationale": "...",
 "evidence": [{"path": "...", "start_line": 12, "end_line": 40, "why": "..."}],
 "need_more_evidence": false,
 "missing": "was dir fehlt, falls need_more_evidence true ist"}

Setze need_more_evidence nur, wenn eine GEZIELTE zusaetzliche Suche dein Urteil
tatsaechlich aendern koennte, und beschreibe in "missing" praezise, wonach
gesucht werden soll.`;

interface LocatorOutput {
  candidates: Evidence[];
  searchSummary: string;
  budgetExhausted: boolean;
}

interface ReaderOutput {
  verdict: Verdict;
  rationale: string;
  evidence: Evidence[];
  needMoreEvidence: boolean;
  missing: string;
}

function normalizeEvidence(raw: unknown): Evidence[] {
  if (!Array.isArray(raw)) return [];
  const result: Evidence[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    const path = typeof entry.path === "string" ? entry.path : null;
    if (!path) continue;

    const start = Number(entry.start_line ?? entry.startLine ?? 1);
    const end = Number(entry.end_line ?? entry.endLine ?? start);
    result.push({
      path: path.replace(/^\.\//, ""),
      startLine: Number.isFinite(start) && start > 0 ? Math.floor(start) : 1,
      endLine: Number.isFinite(end) && end >= start ? Math.floor(end) : Math.floor(start),
      why: typeof entry.why === "string" ? entry.why : undefined,
    });
  }
  return result;
}

/**
 * Locator-Durchlauf. `roundsLeft` ist das verbleibende Suchbudget; es wird
 * über Nachsuchen hinweg weitergereicht, damit eine Regel insgesamt nicht
 * mehr als das gemessene Budget verbraucht.
 */
async function runLocator(
  rule: Rule,
  ctx: ToolContext,
  task: string,
  roundsLeft: { value: number },
  failures: AgentFailure[],
): Promise<LocatorOutput> {
  const messages: Message[] = [
    { role: "system", content: LOCATOR_SYSTEM },
    { role: "user", content: task },
  ];

  while (roundsLeft.value > 0) {
    let completion;
    try {
      completion = await complete(messages, { tools: LOCATOR_TOOLS });
    } catch (error) {
      failures.push({
        stage: "locator",
        ruleId: rule.id,
        message: (error as Error).message,
      });
      return { candidates: [], searchSummary: "", budgetExhausted: false };
    }

    if (completion.toolCalls.length === 0) {
      const parsed = parseJsonObject<{
        candidates?: unknown;
        search_summary?: unknown;
      }>(completion.content);

      if (!parsed) {
        failures.push({
          stage: "locator",
          ruleId: rule.id,
          message: "Abschlussantwort des Locators war nicht formatgerecht.",
        });
        return { candidates: [], searchSummary: "", budgetExhausted: false };
      }

      return {
        candidates: normalizeEvidence(parsed.candidates),
        searchSummary:
          typeof parsed.search_summary === "string" ? parsed.search_summary : "",
        budgetExhausted: false,
      };
    }

    messages.push(completion.raw);

    for (const call of completion.toolCalls) {
      roundsLeft.value -= 1;
      const output = await dispatch(ctx, call.name, call.arguments);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: output.slice(0, 12_000),
      });
    }
  }

  // Budget erschöpft: kein Abbruch, sondern ein definiertes Ergebnis (FA-7).
  // Der Locator wird noch einmal aufgefordert, das Gefundene zusammenzufassen.
  log.warn("locator_budget_exhausted", { ruleId: rule.id });
  messages.push({
    role: "user",
    content:
      "Das Suchbudget ist erschoepft. Fasse jetzt ohne weiteren Werkzeugaufruf " +
      "zusammen, was du gefunden hast, im vorgegebenen JSON-Format.",
  });

  try {
    const completion = await complete(messages);
    const parsed = parseJsonObject<{
      candidates?: unknown;
      search_summary?: unknown;
    }>(completion.content);
    return {
      candidates: normalizeEvidence(parsed?.candidates),
      searchSummary:
        typeof parsed?.search_summary === "string" ? parsed.search_summary : "",
      budgetExhausted: true,
    };
  } catch {
    return { candidates: [], searchSummary: "", budgetExhausted: true };
  }
}

async function runReader(
  rule: Rule,
  ctx: ToolContext,
  candidates: Evidence[],
  searchSummary: string,
  readsLeft: { value: number },
  failures: AgentFailure[],
): Promise<ReaderOutput | null> {
  const candidateList =
    candidates.length > 0
      ? candidates
          .map(
            (c) =>
              `- ${c.path}:${c.startLine}-${c.endLine}` +
              (c.why ? ` (${c.why})` : ""),
          )
          .join("\n")
      : "(keine)";

  const messages: Message[] = [
    { role: "system", content: READER_SYSTEM },
    {
      role: "user",
      content:
        `ZU PRUEFENDE REGEL\n${rule.text}\n\n` +
        `Herkunft: ${rule.adrTitle} (${rule.adrFile})\n\n` +
        `KANDIDATENSTELLEN DES LOCATORS\n${candidateList}\n\n` +
        `SUCHPROTOKOLL DES LOCATORS\n${searchSummary || "(keines)"}\n\n` +
        `Oeffne die relevanten Stellen und faelle dein Urteil.`,
    },
  ];

  for (;;) {
    let completion;
    try {
      completion = await complete(messages, { tools: READER_TOOLS });
    } catch (error) {
      failures.push({
        stage: "reader",
        ruleId: rule.id,
        message: (error as Error).message,
      });
      return null;
    }

    if (completion.toolCalls.length === 0) {
      const parsed = parseJsonObject<Record<string, unknown>>(
        completion.content,
      );
      if (!parsed || typeof parsed.verdict !== "string") {
        failures.push({
          stage: "reader",
          ruleId: rule.id,
          message: "Urteilsantwort war nicht formatgerecht.",
        });
        return null;
      }

      const verdict = String(parsed.verdict).toUpperCase();
      if (verdict !== "C" && verdict !== "NC" && verdict !== "CIA") {
        failures.push({
          stage: "reader",
          ruleId: rule.id,
          message: `Unbekanntes Urteil "${parsed.verdict}".`,
        });
        return null;
      }

      return {
        verdict,
        rationale:
          typeof parsed.rationale === "string"
            ? parsed.rationale
            : "(keine Begruendung geliefert)",
        evidence: normalizeEvidence(parsed.evidence),
        needMoreEvidence: parsed.need_more_evidence === true,
        missing: typeof parsed.missing === "string" ? parsed.missing : "",
      };
    }

    messages.push(completion.raw);

    for (const call of completion.toolCalls) {
      if (readsLeft.value <= 0) {
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content:
            "Das Budget fuer Datei-Oeffnungen ist erschoepft. Faelle jetzt " +
            "dein Urteil auf der vorhandenen Evidenz. Reicht sie nicht, ist " +
            '"CIA" das richtige Urteil.',
        });
        continue;
      }
      readsLeft.value -= 1;
      const output = await dispatch(ctx, call.name, call.arguments);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: output.slice(0, 12_000),
      });
    }
  }
}

/**
 * Der Befund ohne die Verbrauchszahlen: Modellaufrufe und Tokenverbrauch
 * stehen erst fest, wenn die Prüfung durchgelaufen ist, und werden deshalb
 * vom umgebenden Messrahmen ergänzt (NFA-7).
 */
type JudgedRule = Omit<Finding, "modelCalls" | "tokenUsage">;

/**
 * Prüft genau eine Regel auf genau einem Codestand.
 *
 * Gibt immer ein Ergebnis zurück. Ein gescheiterter Modellaufruf führt zu
 * `CIA` und einem Eintrag in `failures`, nie zu einem stillen Verstoß.
 */
export async function judgeRule(
  rule: Rule,
  changedFiles: string[],
): Promise<{ finding: Finding; failures: AgentFailure[] }> {
  const { result, usage } = await withUsageScope(() =>
    judgeRuleInner(rule, changedFiles),
  );

  return {
    finding: {
      ...result.finding,
      modelCalls: usage.modelCalls,
      tokenUsage: {
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
      },
    },
    failures: result.failures,
  };
}

async function judgeRuleInner(
  rule: Rule,
  changedFiles: string[],
): Promise<{ finding: JudgedRule; failures: AgentFailure[] }> {
  const failures: AgentFailure[] = [];
  const trace: Finding["trace"] = [];

  const roundsLeft = { value: config.budget.searchRounds };
  const readsLeft = { value: config.budget.fileReads };

  const locatorCtx: ToolContext = { role: "locator", trace };
  const readerCtx: ToolContext = { role: "reader", trace };

  const baseTask =
    `ZU PRUEFENDE REGEL\n${rule.text}\n\n` +
    `Herkunft: ${rule.adrTitle} (${rule.adrFile})\n\n` +
    `Im Merge Request geaenderte Dateien (${changedFiles.length}):\n` +
    `${changedFiles.slice(0, 100).join("\n") || "(keine)"}\n\n` +
    `Finde die Stellen, an denen sich diese Regel entscheiden laesst.`;

  let located = await runLocator(
    rule,
    locatorCtx,
    baseTask,
    roundsLeft,
    failures,
  );
  let budgetExhausted = located.budgetExhausted;

  let reader = await runReader(
    rule,
    readerCtx,
    located.candidates,
    located.searchSummary,
    readsLeft,
    failures,
  );

  // Nachsuche: vom Programm ausgelöst, nicht vom Modell, höchstens zweimal
  // je Regel (Abbildung 5.2).
  let refetches = 0;
  while (
    reader &&
    reader.needMoreEvidence &&
    refetches < config.budget.refetches &&
    roundsLeft.value > 0
  ) {
    refetches += 1;
    log.info("refetch", { ruleId: rule.id, attempt: refetches });

    located = await runLocator(
      rule,
      locatorCtx,
      `${baseTask}\n\nGEZIELTE NACHSUCHE\nDem Reader fehlt: ${reader.missing}\n` +
        `Bereits gemeldete Stellen:\n` +
        located.candidates.map((c) => `- ${c.path}`).join("\n"),
      roundsLeft,
      failures,
    );
    budgetExhausted = budgetExhausted || located.budgetExhausted;

    // Der Reader bekommt für die Nachsuche wieder Leseluft, damit die neuen
    // Stellen überhaupt geöffnet werden können.
    readsLeft.value = Math.max(readsLeft.value, 2);

    reader = await runReader(
      rule,
      readerCtx,
      located.candidates,
      located.searchSummary,
      readsLeft,
      failures,
    );
  }

  const finding: JudgedRule = reader
    ? {
        id: randomUUID(),
        rule,
        verdict: reader.verdict,
        rationale: reader.rationale,
        evidence: reader.evidence.length > 0 ? reader.evidence : located.candidates,
        trace,
        budgetExhausted: budgetExhausted || roundsLeft.value <= 0,
      }
    : {
        // Kein verwertbares Urteil: als CIA geführt und als Fehlschlag
        // protokolliert, statt still als Verstoß zu gelten (NFA-2).
        id: randomUUID(),
        rule,
        verdict: "CIA",
        rationale:
          "Kein verwertbares Urteil: Die Modellantwort war nicht formatgerecht " +
          "oder der Aufruf ist gescheitert. Der Fall wird nicht gemeldet.",
        evidence: located.candidates,
        trace,
        budgetExhausted,
      };

  const emptyGreps = trace.filter(
    (t) => t.tool === "grep" && t.resultCount === 0,
  ).length;

  log.info("rule_judged", {
    ruleId: rule.id,
    adrFile: rule.adrFile,
    verdict: finding.verdict,
    toolCalls: trace.length,
    emptyGreps,
    refetches,
    budgetExhausted: finding.budgetExhausted,
  });

  return { finding, failures };
}
