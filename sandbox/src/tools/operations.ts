/** Schreibgeschützte Werkzeugoperationen samt Begrenzungen und Aufrufprotokoll. */
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { ToolCallTrace } from "../types.js";
import { counters, log } from "../trace.js";
import { ROOT, MAX_FILE_BYTES, baseSource, isExcluded, safeResolve, sourceLines, toRelative, walk } from "./repository.js";

const MAX_GREP_MATCHES = 60;
const MAX_LIST_ENTRIES = 400;
const MAX_READ_LINES = 400;

export interface ToolContext {
  role: "locator" | "reader";
  trace: ToolCallTrace[];
  /** Auch große Quelldateien und den Originaldiff ausschnittweise lesen. */
  largeTextFiles?: boolean;
}

function record(
  ctx: ToolContext,
  tool: ToolCallTrace["tool"],
  args: Record<string, unknown>,
  resultCount: number,
  startedAt: number,
): void {
  const entry: ToolCallTrace = {
    step: ctx.trace.length + 1,
    role: ctx.role,
    tool,
    args,
    resultCount,
    durationMs: Date.now() - startedAt,
  };
  ctx.trace.push(entry);
  counters.toolCalls += 1;
  log.info("tool_call", entry as unknown as Record<string, unknown>);
}

/** Listet Dateien unterhalb eines Verzeichnisses. */
export async function listFiles(
  ctx: ToolContext,
  args: { path?: string },
): Promise<string> {
  const startedAt = Date.now();
  const target = args.path ?? ".";

  try {
    const absolute = await safeResolve(target);
    const info = await stat(absolute).catch(() => null);
    if (!info) {
      record(ctx, "list_files", args, 0, startedAt);
      return `Pfad existiert nicht: ${target}`;
    }
    if (!info.isDirectory()) {
      record(ctx, "list_files", args, 1, startedAt);
      return toRelative(absolute);
    }

    const budget = { left: MAX_LIST_ENTRIES };
    const files = await walk(absolute, budget);
    record(ctx, "list_files", args, files.length, startedAt);

    if (files.length === 0) return `Keine Dateien unter ${target}.`;
    const truncated = budget.left <= 0 ? "\n… (Liste gekuerzt)" : "";
    return files.sort().join("\n") + truncated;
  } catch (error) {
    record(ctx, "list_files", args, 0, startedAt);
    return `Fehler: ${(error as Error).message}`;
  }
}

/** Regex-Suche mit optionalem Pfad-Filter. */
export async function grep(
  ctx: ToolContext,
  args: { pattern: string; path?: string; ignore_case?: boolean },
): Promise<string> {
  const startedAt = Date.now();

  let regex: RegExp;
  try {
    regex = new RegExp(args.pattern, args.ignore_case ? "i" : "");
  } catch (error) {
    record(ctx, "grep", args, 0, startedAt);
    return `Ungueltiger regulaerer Ausdruck: ${(error as Error).message}`;
  }

  try {
    const absolute = await safeResolve(args.path ?? ".");
    const info = await stat(absolute).catch(() => null);
    if (!info) {
      record(ctx, "grep", args, 0, startedAt);
      return `Pfad existiert nicht: ${args.path}`;
    }

    const candidates = info.isDirectory()
      ? await walk(absolute, { left: 20_000 })
      : [toRelative(absolute)];

    const matches: string[] = [];
    for (const rel of candidates) {
      if (matches.length >= MAX_GREP_MATCHES) break;
      const fileInfo = await stat(join(ROOT, rel)).catch(() => null);
      if (!fileInfo || (!ctx.largeTextFiles && fileInfo.size > MAX_FILE_BYTES)) continue;

      if (ctx.largeTextFiles && fileInfo.size > MAX_FILE_BYTES) {
        if (isExcluded(rel)) continue;
        try {
          let lineNumber = 0;
          for await (const line of sourceLines(join(ROOT, rel))) {
            lineNumber += 1;
            if (regex.test(line)) matches.push(`${rel}:${lineNumber}: ${line.trim().slice(0, 240)}`);
            if (matches.length >= MAX_GREP_MATCHES) break;
          }
        } catch {
          // Unlesbare Dateien wie bei kleinen Dateien ueberspringen.
        }
        continue;
      }

      let content: string;
      try {
        content = await readFile(join(ROOT, rel), "utf8");
      } catch {
        continue;
      }

      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i += 1) {
        if (matches.length >= MAX_GREP_MATCHES) break;
        if (regex.test(lines[i])) {
          matches.push(`${rel}:${i + 1}: ${lines[i].trim().slice(0, 240)}`);
        }
      }
    }

    // resultCount === 0 ist die "Leersuche" - genau die Größe, an der sich
    // später ablesen lässt, ob ein Ausweichurteil aus fehlender oder aus
    // erfolgloser Suche hervorging (Abschnitt 6.6.1).
    record(ctx, "grep", args, matches.length, startedAt);

    if (matches.length === 0) {
      return `Keine Treffer fuer /${args.pattern}/ unter ${args.path ?? "."}.`;
    }
    return (
      matches.join("\n") +
      (matches.length >= MAX_GREP_MATCHES ? "\n… (weitere Treffer gekuerzt)" : "")
    );
  } catch (error) {
    record(ctx, "grep", args, 0, startedAt);
    return `Fehler: ${(error as Error).message}`;
  }
}

/** Liest einen Zeilenbereich einer Datei, mit Zeilennummern. */
export async function readFileTool(
  ctx: ToolContext,
  args: { path: string; start_line?: number; end_line?: number; revision?: "base" },
): Promise<string> {
  const startedAt = Date.now();

  try {
    const absolute = await safeResolve(args.path);
    const rel = toRelative(absolute);

    if (isExcluded(rel)) {
      record(ctx, "read_file", args, 0, startedAt);
      // FA-5: Die zu prüfende Regel darf sich nicht als eigener Beleg
      // wiederfinden.
      return `Datei liegt ausserhalb des Suchraums: ${args.path}`;
    }
    if (args.revision !== undefined) {
      if (args.revision !== "base") throw new Error("Unbekannter Codestand.");
      const lines = (await baseSource(rel)).split("\n");
      const start = Math.max(1, Math.floor(args.start_line ?? 1));
      const end = Math.min(lines.length, Math.max(start, Math.floor(args.end_line ?? start + MAX_READ_LINES - 1)), start + MAX_READ_LINES - 1);
      const window = lines.slice(start - 1, end);
      record(ctx, "read_file", args, window.length, startedAt);
      return `${rel} (Basisstand, Zeilen ${start}-${end} von ${lines.length}):\n${window.map((line, index) => `${start + index}\t${line}`).join("\n")}`;
    }

    const info = await stat(absolute).catch(() => null);
    if (!info || !info.isFile()) {
      record(ctx, "read_file", args, 0, startedAt);
      return `Datei existiert nicht: ${args.path}`;
    }
    if (info.size > MAX_FILE_BYTES) {
      if (ctx.largeTextFiles) {
        const start = Math.max(1, Math.floor(args.start_line ?? 1));
        const end = Math.min(Math.max(start, Math.floor(args.end_line ?? start + MAX_READ_LINES - 1)), start + MAX_READ_LINES - 1);
        const numbered: string[] = [];
        let lineNumber = 0;
        for await (const line of sourceLines(absolute)) {
          lineNumber += 1;
          if (lineNumber >= start) numbered.push(`${lineNumber}\t${line}`);
          if (lineNumber >= end) break;
        }
        record(ctx, "read_file", args, numbered.length, startedAt);
        return `${rel} (Zeilen ${start}-${lineNumber} von unbekannt):\n${numbered.join("\n")}`;
      }
      record(ctx, "read_file", args, 0, startedAt);
      return `Datei zu gross (${info.size} Bytes): ${args.path}`;
    }

    const lines = (await readFile(absolute, "utf8")).split("\n");
    const start = Math.max(1, args.start_line ?? 1);
    const end = Math.min(
      lines.length,
      args.end_line ?? Math.min(lines.length, start + MAX_READ_LINES - 1),
    );
    const window = lines.slice(start - 1, end);

    record(ctx, "read_file", args, window.length, startedAt);

    const numbered = window
      .map((line, index) => `${start + index}\t${line}`)
      .join("\n");
    return `${rel} (Zeilen ${start}-${end} von ${lines.length}):\n${numbered}`;
  } catch (error) {
    record(ctx, "read_file", args, 0, startedAt);
    return `Fehler: ${(error as Error).message}`;
  }
}
