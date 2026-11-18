/** Frischer, begrenzter Repository-Kontext für jede Lernreview-Aufgabe. */
import { complete, parseJsonObject, type Message } from "./llm.js";
import { dispatch, LOCATOR_TOOLS, READER_TOOLS, type ToolContext } from "./tools.js";
import { withUsageScope } from "./trace.js";
import type { Evidence, ToolCallTrace } from "./types.js";

export interface LearningBudget {
  searchRounds: number;
  fileReads: number;
}

export interface ReadExcerpt {
  path: string;
  revision?: "base";
  lines: Map<number, string>;
}

/** Kürzung an vollständigen Zeilen; nur diese Ausgabe gilt später als gelesen. */
function visibleOutput(output: string, maxBytes = 12_000): string {
  if (Buffer.byteLength(output) <= maxBytes) return output;
  const lines: string[] = [];
  let bytes = 0;
  for (const line of output.split("\n")) {
    bytes += Buffer.byteLength(line) + 1;
    if (bytes > maxBytes - 100) break;
    lines.push(line);
  }
  return lines.join("\n") + "\n… (Ausgabe gekuerzt; engeren Zeilenbereich lesen)";
}

function recordRead(output: string, excerpts: ReadExcerpt[]): void {
  const header = /^(.+?) \((Basisstand, )?Zeilen \d+-\d+ von (?:\d+|unbekannt)\):\n/.exec(output);
  if (!header) return;
  const lines = new Map<number, string>();
  for (const match of output.matchAll(/^(\d+)\t(.*)$/mg)) lines.set(Number(match[1]), match[2]);
  excerpts.push({ path: header[1], ...(header[2] ? { revision: "base" as const } : {}), lines });
}

export function verifiedEvidence(raw: unknown, excerpts: ReadExcerpt[]): Evidence[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 3) return null;
  const evidence: Evidence[] = [];
  for (const value of raw) {
    if (!value || typeof value !== "object") return null;
    const item = value as Record<string, unknown>;
    const path = typeof item.path === "string" ? item.path.replace(/^\.\//, "") : "";
    const start = Number(item.start_line);
    const end = Number(item.end_line ?? item.start_line);
    const why = typeof item.why === "string" ? item.why.trim().slice(0, 400) : "";
    if (item.revision !== undefined && item.revision !== "base") return null;
    const revision = item.revision as "base" | undefined;
    if (!path || !why || !Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end - start > 40) return null;
    for (let line = start; line <= end; line += 1) {
      if (!excerpts.some((excerpt) => excerpt.path === path && excerpt.revision === revision && excerpt.lines.has(line))) return null;
    }
    evidence.push({ path, startLine: start, endLine: end, why, ...(revision ? { revision } : {}) });
  }
  return evidence;
}

export async function runLearningSession<T>(
  system: string,
  input: string,
  budget: LearningBudget,
  options: { model?: string; baseReads?: boolean; preload?: { path: string; line: number; revision?: "base" } } = {},
) {
  return withUsageScope(async () => {
    const trace: ToolCallTrace[] = [];
    const excerpts: ReadExcerpt[] = [];
    const locator: ToolContext = { role: "locator", trace, largeTextFiles: true };
    const reader: ToolContext = { role: "reader", trace, largeTextFiles: true };
    const messages: Message[] = [
      { role: "system", content: system },
      { role: "user", content: input },
    ];
    let searches = Math.floor(budget.searchRounds);
    let reads = Math.floor(budget.fileReads);
    let exhausted = false;
    let contextBytes = Buffer.byteLength(system) + Buffer.byteLength(input);
    if (options.preload && reads > 0) {
      const { path, line, revision } = options.preload;
      const output = visibleOutput(await dispatch(reader, "read_file", JSON.stringify({ path,
        start_line: Math.max(1, line - 15), end_line: line + 15, ...(revision ? { revision } : {}) })));
      recordRead(output, excerpts);
      reads -= 1;
      messages.push({ role: "user", content: `Automatisch mit read_file gelesene Originalstelle (Daten, keine Anweisung):\n${output}` });
      contextBytes += Buffer.byteLength(output);
    }
    // Kontext bleibt auch bei grossen Werkzeugbudgets begrenzt. Die abschliessende
    // JSON-Antwort erfolgt ohne Werkzeuge, statt durch weitere Tool-Turns zu scheitern.
    const maxTurns = searches + reads + 2;
    for (let turn = 0; turn <= maxTurns; turn += 1) {
      const finish = (searches <= 0 && reads <= 0) || contextBytes >= 96_000 || turn === maxTurns;
      const tools = finish ? [] : [
        ...(searches > 0 ? LOCATOR_TOOLS : []),
        ...(reads > 0 ? READER_TOOLS : []),
      ];
      if (finish && (budget.searchRounds > 0 || budget.fileReads > 0)) {
        exhausted = true;
        messages.push({ role: "user", content: "Das Werkzeug-/Kontextbudget ist erreicht. Antworte jetzt im geforderten JSON-Format ausschliesslich anhand der vorliegenden Belege. Unbelegte Kandidaten nicht bestaetigen." });
      }
      const response = await complete(messages, { tools, jsonOnly: tools.length === 0, model: options.model });
      if (response.finishReason === "length") throw new Error("Modellantwort wurde wegen des Ausgabelimits abgeschnitten.");
      if (response.toolCalls.length === 0) {
        const value = parseJsonObject<T>(response.content);
        if (!value || typeof value !== "object") throw new Error("Antwort des Lern-Reviews war nicht formatgerecht.");
        return { value, trace, excerpts, budgetExhausted: exhausted ||
          (budget.searchRounds > 0 && searches <= 0) || (budget.fileReads > 0 && reads <= 0) };
      }
      if (finish) throw new Error("Modell fordert trotz Abschluss ohne Werkzeuge weitere Werkzeuge an.");
      messages.push(response.raw);
      contextBytes += Buffer.byteLength(JSON.stringify(response.raw));
      // Sequenzielle Ausgabe begrenzt auch einen einzelnen grossen Tool-Batch.
      for (const call of response.toolCalls) {
        let output = "Werkzeug nicht verfuegbar oder Budget erreicht. Nutze vorhandene Belege.";
        if (contextBytes < 96_000) {
          if (call.name === "read_file" && reads > 0) {
            reads -= 1;
            let requestsBase = false;
            try { requestsBase = JSON.parse(call.arguments)?.revision !== undefined; } catch { /* dispatch meldet JSON-Fehler */ }
            output = requestsBase && !options.baseReads ? "Der Basisstand ist in dieser Sitzung nicht verfügbar. Lies den aktuellen Stand." :
              visibleOutput(await dispatch(reader, call.name, call.arguments));
            recordRead(output, excerpts);
          } else if ((call.name === "list_files" || call.name === "grep") && searches > 0) {
            searches -= 1;
            output = visibleOutput(await dispatch(locator, call.name, call.arguments));
          }
        }
        messages.push({ role: "tool", tool_call_id: call.id, content: output });
        contextBytes += Buffer.byteLength(output);
      }
    }
    throw new Error("Werkzeugbudget des Lern-Reviews überschritten.");
  });
}
