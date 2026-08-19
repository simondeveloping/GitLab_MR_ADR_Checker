/**
 * Die drei schreibgeschützten Werkzeuge des Agenten (NFA-6).
 *
 * `list_files` und `grep` gehören dem Locator, `read_file` dem Reader. Die
 * Trennung ist keine Kosmetik: Sie hält die Werkzeugprotokolle auswertbar,
 * weil sich aus ihnen ablesen lässt, ob eine Suche erfolglos blieb oder ob
 * gefundene Evidenz nicht gelesen wurde.
 *
 * Alle drei laufen ohne Shell-Zugriff und ausschließlich lesend. Der
 * Suchraum ist der geklonte Baum; Pfad-Ausbrüche werden über `realpath`
 * abgefangen, nicht nur über Zeichenkettenprüfung, damit ein Symlink nicht
 * daran vorbeiführt.
 *
 * SUCHRAUM (Abschnitt 7.2.4): Der Agent sieht bewusst mehr als nur
 * Programmiersprachen-Dateien. Nach Abschnitt 6.2.2 liegt die Mehrheit der als
 * nicht entscheidbar eingestuften Regeln an Belegen, die im Repository sehr
 * wohl existieren, aber in CI-Konfiguration, Build-Dateien oder Linter-Regeln.
 * Ausgeschlossen bleiben nur die ADR-Dateien selbst, damit sich die zu
 * prüfende Regel nicht als eigener Beleg wiederfindet (FA-5), sowie
 * Binärformate und generierte Verzeichnisse.
 */

import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { config } from "./config.js";
import type { ToolCallTrace } from "./types.js";
import { counters, log } from "./trace.js";

const ROOT = resolve(config.repoDir);

/** Verzeichnisse, die nie durchsucht werden. */
const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "out",
  ".next",
  "target",
  "vendor",
  "__pycache__",
  ".venv",
  ".mypy_cache",
  ".pytest_cache",
  ".gradle",
  ".idea",
]);

/** Endungen, die kein lesbarer Text sind. */
const BINARY_EXTENSIONS =
  /\.(png|jpe?g|gif|svg|ico|webp|bmp|pdf|woff2?|ttf|eot|otf|mp4|mp3|wav|zip|tar|gz|bz2|xz|7z|jar|war|so|dylib|dll|exe|bin|class|wasm|pyc|db|sqlite3?)$/i;

const MAX_FILE_BYTES = 512 * 1024;
const MAX_GREP_MATCHES = 60;
const MAX_LIST_ENTRIES = 400;
const MAX_READ_LINES = 400;

/**
 * Die ADR-Dateien sind vom Suchraum ausgenommen (FA-5). Der Pfad wird beim
 * Start gesetzt, sobald feststeht, welche Regelbasis gilt.
 */
let excludedAdrPaths: Set<string> = new Set();

export function setExcludedAdrPaths(paths: string[]): void {
  excludedAdrPaths = new Set(paths.map((p) => p.replace(/^\.\//, "")));
}

function isExcluded(relPath: string): boolean {
  if (excludedAdrPaths.has(relPath)) return true;
  // Das gesamte ADR-Verzeichnis bleibt außen vor, auch bei neuen Dateien.
  if (relPath.startsWith(`${config.projectAdrDir}/`)) return true;
  if (BINARY_EXTENSIONS.test(relPath)) return true;
  return relPath.split("/").some((segment) => SKIP_DIRS.has(segment));
}

/**
 * Löst einen vom Modell gelieferten Pfad auf und stellt sicher, dass er
 * innerhalb des Projektbaums bleibt.
 */
async function safeResolve(input: string): Promise<string> {
  const cleaned = input.replace(/^\.\//, "").replace(/^\/+/, "");
  const candidate = resolve(ROOT, cleaned);

  if (candidate !== ROOT && !candidate.startsWith(ROOT + sep)) {
    throw new Error(`Pfad ausserhalb des Projektbaums: ${input}`);
  }

  // Symlinks könnten auf einen Pfad außerhalb zeigen.
  let real: string;
  try {
    real = await realpath(candidate);
  } catch {
    return candidate; // existiert nicht; der Aufrufer meldet das
  }
  if (real !== ROOT && !real.startsWith(ROOT + sep)) {
    throw new Error(`Symlink verlässt den Projektbaum: ${input}`);
  }
  return real;
}

function toRelative(absolute: string): string {
  return relative(ROOT, absolute).split(sep).join("/");
}

/** Rekursives Einsammeln aller sichtbaren Dateien unterhalb von `dir`. */
async function walk(dir: string, budget: { left: number }): Promise<string[]> {
  if (budget.left <= 0) return [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    if (budget.left <= 0) break;
    // Nur das Verzeichnis .git fällt heraus. Ein Präfix-Vergleich würde auch
    // .gitlab-ci.yml und .gitignore verschlucken - also genau die CI- und
    // Build-Artefakte, die laut Abschnitt 6.2.2 einen erheblichen Teil der
    // Architekturregeln überhaupt erst entscheidbar machen.
    if (entry.isDirectory() && entry.name === ".git") continue;

    const absolute = join(dir, entry.name);
    const rel = toRelative(absolute);

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      files.push(...(await walk(absolute, budget)));
    } else if (entry.isFile()) {
      if (isExcluded(rel)) continue;
      files.push(rel);
      budget.left -= 1;
    }
  }
  return files;
}

export interface ToolContext {
  role: "locator" | "reader";
  trace: ToolCallTrace[];
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
      if (!fileInfo || fileInfo.size > MAX_FILE_BYTES) continue;

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
  args: { path: string; start_line?: number; end_line?: number },
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

    const info = await stat(absolute).catch(() => null);
    if (!info || !info.isFile()) {
      record(ctx, "read_file", args, 0, startedAt);
      return `Datei existiert nicht: ${args.path}`;
    }
    if (info.size > MAX_FILE_BYTES) {
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

/** Werkzeugbeschreibungen für die Chat-Completions-Schnittstelle. */
export const LOCATOR_TOOLS = [
  {
    name: "list_files",
    description:
      "Listet alle Dateien unterhalb eines Verzeichnisses, relativ zur Repository-Wurzel. Ohne Argument die gesamte Wurzel.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Verzeichnis relativ zur Repository-Wurzel, z. B. 'src/services'.",
        },
      },
    },
  },
  {
    name: "grep",
    description:
      "Sucht einen regulaeren Ausdruck im Repository und liefert Treffer als 'pfad:zeile: inhalt'. Optionaler Pfad-Filter grenzt die Suche ein.",
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Regulaerer Ausdruck (JavaScript-Syntax).",
        },
        path: {
          type: "string",
          description: "Datei oder Verzeichnis, auf das die Suche beschraenkt wird.",
        },
        ignore_case: {
          type: "boolean",
          description: "Gross-/Kleinschreibung ignorieren.",
        },
      },
      required: ["pattern"],
    },
  },
];

export const READER_TOOLS = [
  {
    name: "read_file",
    description:
      "Liest einen Zeilenbereich einer Datei mit Zeilennummern. Ohne Bereich die ersten 400 Zeilen.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Pfad relativ zur Repository-Wurzel." },
        start_line: { type: "integer", description: "Erste Zeile (1-basiert)." },
        end_line: { type: "integer", description: "Letzte Zeile (einschliesslich)." },
      },
      required: ["path"],
    },
  },
];

/** Führt einen vom Modell gewählten Werkzeugaufruf aus. */
export async function dispatch(
  ctx: ToolContext,
  name: string,
  rawArgs: string,
): Promise<string> {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(rawArgs || "{}") as Record<string, unknown>;
  } catch {
    return `Argumente sind kein gueltiges JSON: ${rawArgs.slice(0, 200)}`;
  }

  switch (name) {
    case "list_files":
      return listFiles(ctx, args as { path?: string });
    case "grep":
      if (typeof args.pattern !== "string") {
        return "Argument 'pattern' fehlt.";
      }
      return grep(ctx, args as { pattern: string; path?: string });
    case "read_file":
      if (typeof args.path !== "string") {
        return "Argument 'path' fehlt.";
      }
      return readFileTool(
        ctx,
        args as { path: string; start_line?: number; end_line?: number },
      );
    default:
      return `Unbekanntes Werkzeug: ${name}`;
  }
}
