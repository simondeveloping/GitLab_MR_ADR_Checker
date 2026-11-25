/**
 * Gemeinsamer Repository-Zugriff: Pfadgrenzen, Suchraum und Basisstand (NFA-6).
 *
 * Der Agent sieht auch CI-Konfiguration, Build-Dateien und Linter-Regeln.
 * Ausgeschlossen bleiben ADR-Dateien als eigene Belege (FA-5), Binärformate
 * und generierte Verzeichnisse. realpath prüft zusätzlich Symlink-Ziele.
 */
import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join, relative, resolve, sep } from "node:path";
import { config } from "../config.js";

export const ROOT = resolve(config.repoDir);
export const MAX_FILE_BYTES = 512 * 1024;
const run = promisify(execFile);
let baseSha = "";

export function setBaseSha(sha: string): void {
  if (!/^[a-f0-9]{40,64}$/.test(sha)) throw new Error("Ungültige Diff-Basis.");
  baseSha = sha;
}

export async function baseSource(path: string): Promise<string> {
  if (!baseSha) throw new Error("Diff-Basis ist nicht verfügbar.");
  const { stdout } = await run("git", ["show", `${baseSha}:${path}`], {
    cwd: ROOT, maxBuffer: 2 * 1024 * 1024, timeout: 5000,
  });
  return stdout;
}

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

/**
 * Die ADR-Dateien sind vom Suchraum ausgenommen (FA-5). Der Pfad wird beim
 * Start gesetzt, sobald feststeht, welche Regelbasis gilt.
 */
let excludedAdrPaths: Set<string> = new Set();

export function setExcludedAdrPaths(paths: string[]): void {
  excludedAdrPaths = new Set(paths.map((p) => p.replace(/^\.\//, "")));
}

export function isExcluded(relPath: string): boolean {
  if (excludedAdrPaths.has(relPath)) return true;
  // Das gesamte ADR-Verzeichnis bleibt außen vor, auch bei neuen Dateien.
  if (relPath.startsWith(`${config.projectAdrDir}/`)) return true;
  if (BINARY_EXTENSIONS.test(relPath)) return true;
  return relPath.split("/").some((segment) => SKIP_DIRS.has(segment));
}

/** Lädt einen kleinen Quelltextausschnitt für die Anzeige eines Befunds. */
export async function loadEvidenceSnippet(
  path: string,
  startLine: number,
  endLine: number,
  revision?: "base",
): Promise<{ startLine: number; lines: string[] } | undefined> {
  try {
    const absolute = await safeResolve(path);
    const rel = toRelative(absolute);
    if (isExcluded(rel)) return undefined;

    if (!revision) {
      const info = await stat(absolute);
      if (!info.isFile() || info.size > MAX_FILE_BYTES) return undefined;
    }
    const sourceLines = (revision ? await baseSource(rel) : await readFile(absolute, "utf8")).split("\n");
    const first = Math.max(1, Math.floor(startLine) - 2);
    const last = Math.min(
      sourceLines.length,
      Math.max(Math.floor(endLine) + 2, first + 5),
      first + 9,
    );
    if (first > sourceLines.length || last < first) return undefined;

    return {
      startLine: first,
      lines: sourceLines.slice(first - 1, last).map((line) => line.slice(0, 500)),
    };
  } catch {
    return undefined;
  }
}

/**
 * Löst einen vom Modell gelieferten Pfad auf und stellt sicher, dass er
 * innerhalb des Projektbaums bleibt.
 */
export async function safeResolve(input: string): Promise<string> {
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

export function toRelative(absolute: string): string {
  return relative(ROOT, absolute).split(sep).join("/");
}

/** Rekursives Einsammeln aller sichtbaren Dateien unterhalb von `dir`. */
export async function walk(dir: string, budget: { left: number }): Promise<string[]> {
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

export async function* sourceLines(path: string): AsyncGenerator<string> {
  const stream = createReadStream(path, { encoding: "utf8" });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of lines) yield line;
  } finally {
    lines.close();
    stream.destroy();
  }
}
