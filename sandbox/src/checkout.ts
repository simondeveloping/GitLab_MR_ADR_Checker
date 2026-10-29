/**
 * Schritt 1 der Pipeline: Checkout und Änderungssatz (Abschnitt 7.2.1).
 *
 * Der Container klont das Repository auf den Stand des Merge Requests, erzeugt
 * den Diff gegen den Zielbranch und filtert dabei ADR-Dokumente sowie Rauschen
 * heraus, das für eine Architekturaussage nichts beiträgt, aber Kontext
 * verbraucht (FA-13).
 *
 * Der gefilterte Änderungssatz wird nicht als Text an den Modellaufruf
 * übergeben, sondern physisch als Datei `mr_diff.patch` im geklonten
 * Repository abgelegt. Betriebssysteme deckeln die Länge von
 * Kommandozeilenargumenten (ARG_MAX, meist rund 130.000 Zeichen); liest der
 * Agent den Diff mit demselben Werkzeug wie den übrigen Quellbaum, entfällt
 * diese Schranke, das System skaliert mit dem Umfang des Änderungssatzes
 * (NFA-8), und der Diff ist für den Agenten nichts Besonderes mehr, sondern
 * eine weitere Datei im Suchraum.
 */

import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { config } from "./config.js";
import { log } from "./trace.js";

const run = promisify(execFile);

/**
 * Generierte oder binäre Artefakte. Sie sind für eine Architekturaussage
 * ohne Wert, fressen aber Kontext.
 */
const NOISE_PATTERNS: RegExp[] = [
  /(^|\/)package-lock\.json$/,
  /(^|\/)yarn\.lock$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)composer\.lock$/,
  /(^|\/)Gemfile\.lock$/,
  /(^|\/)Cargo\.lock$/,
  /(^|\/)poetry\.lock$/,
  /(^|\/)go\.sum$/,
  /(^|\/)Pipfile\.lock$/,
  /(^|\/)\.min\.(js|css)$/,
  /\.(png|jpe?g|gif|svg|ico|webp|bmp|pdf|woff2?|ttf|eot|mp4|mp3|zip|tar|gz|jar|so|dll|exe|class|wasm)$/i,
  /(^|\/)(dist|build|node_modules|vendor|\.next|target)\//,
  /\.(snap|lock)$/,
];

function isNoise(path: string): boolean {
  return NOISE_PATTERNS.some((pattern) => pattern.test(path));
}

async function git(args: string[], cwd?: string): Promise<string> {
  const { stdout } = await run("git", args, {
    cwd,
    maxBuffer: 256 * 1024 * 1024,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_CONFIG_NOSYSTEM: "1",
    },
  });
  return stdout;
}

export interface CheckoutResult {
  /** Prüfrelevante Pfade ohne ADRs und Rauschen, relativ zur Repository-Wurzel. */
  changedFiles: string[];
  /** Pfade, die der Rauschfilter entfernt hat. */
  filteredFiles: string[];
  /** ADR-Pfade, die nicht Teil des Code-Reviews sind. */
  excludedAdrFiles: string[];
  /** Merge-Base gegen den Zielbranch. */
  baseSha: string;
}

function isProjectAdr(path: string): boolean {
  const adrDir = config.projectAdrDir.replace(/^\.\//, "").replace(/\/$/, "");
  return Boolean(adrDir) && path.startsWith(`${adrDir}/`);
}

/**
 * Klont das Repository und legt den Code-Review-Diff ohne ADRs als Patch-Datei ab.
 */
export async function checkout(): Promise<CheckoutResult> {
  // Voller Klon statt `--depth 1`: Der Agent beurteilt die Regel am Zustand
  // des gesamten Repositorys nach der Änderung, und die Merge-Base gegen den
  // Zielbranch muss erreichbar sein.
  await git([
    "clone",
    "--no-tags",
    "--quiet",
    config.repoUrl,
    config.repoDir,
  ]);
  await git(["checkout", "--quiet", "--detach", config.sha], config.repoDir);

  let baseSha: string;
  try {
    baseSha = (
      await git(
        ["merge-base", `origin/${config.targetBranch}`, config.sha],
        config.repoDir,
      )
    ).trim();
  } catch {
    // Fällt der Zielbranch weg, dient der erste Elterncommit als Bezugspunkt.
    baseSha = (await git(["rev-parse", `${config.sha}^`], config.repoDir)).trim();
  }

  const allChanged = (
    await git(
      ["diff", "--name-only", `${baseSha}..${config.sha}`],
      config.repoDir,
    )
  )
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const changedFiles = allChanged.filter(
    (path) => !isNoise(path) && !isProjectAdr(path),
  );
  const filteredFiles = allChanged.filter((path) => isNoise(path));
  const excludedAdrFiles = allChanged.filter(isProjectAdr);

  // Der Patch wird nur über die verbliebenen Pfade erzeugt. `--` trennt
  // Optionen von Pfaden, damit ein Dateiname mit führendem Bindestrich nicht
  // als Option gelesen wird.
  const patch =
    changedFiles.length > 0
      ? await git(
          [
            "diff",
            "--no-color",
            "--unified=3",
            `${baseSha}..${config.sha}`,
            "--",
            ...changedFiles,
          ],
          config.repoDir,
        )
      : "";

  const header =
    `# Aenderungssatz des Merge Requests !${config.mrIid}\n` +
    `# ${config.sourceBranch} -> ${config.targetBranch}\n` +
    `# Basis: ${baseSha}  Kopf: ${config.sha}\n` +
    (filteredFiles.length > 0
      ? `# Als Rauschen herausgefiltert (${filteredFiles.length}): ${filteredFiles.join(", ")}\n`
      : "") +
    (excludedAdrFiles.length > 0
      ? `# Als ADR-Regelbasis ausgeschlossen (${excludedAdrFiles.length}): ${excludedAdrFiles.join(", ")}\n`
      : "") +
    `\n`;

  await writeFile(join(config.repoDir, config.patchFile), header + patch, "utf8");

  log.info("checkout_done", {
    changed: changedFiles.length,
    filtered: filteredFiles.length,
    excludedAdr: excludedAdrFiles.length,
    baseSha,
    patchBytes: patch.length,
  });

  return { changedFiles, filteredFiles, excludedAdrFiles, baseSha };
}
