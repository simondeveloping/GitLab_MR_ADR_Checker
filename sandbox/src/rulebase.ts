/**
 * Schritt 2 der Pipeline: Regelbasis (Abschnitt 7.2.2, FA-3).
 *
 * Zweistufiger Rückfall: Zuerst sucht die Sandbox im geklonten Repository
 * nach projektspezifischen ADRs unter `docs/adr/` und greift andernfalls auf
 * eine organisationsweite Regelbasis zurück, die als Gruppenstandard im
 * Container mitgeliefert wird. Der Aufbau bildet die Realität in Unternehmen
 * ab, in denen abteilungsweite Basisregeln und dedizierte Vorgaben einzelner
 * Dienste nebeneinander bestehen, und sorgt vor allem dafür, dass ein neues
 * Repository ohne jede Vorkonfiguration geprüft werden kann (NFA-9).
 */

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config.js";
import { log } from "./trace.js";
import type { RuleOrigin } from "./types.js";

export interface AdrDocument {
  /** Dateiname, etwa `001-datenbank.md`. Wandert in jeden Kommentar. */
  file: string;
  /** Pfad relativ zur Repository-Wurzel; nur bei Projekt-ADRs gesetzt. */
  repoPath?: string;
  title: string;
  content: string;
  origin: RuleOrigin;
  status: string;
}

const ADR_FILE = /\.mdx?$/i;
/** Register und Vorlagen sind keine Entscheidungen. */
const NON_ADR = /^(readme|index|template|_)/i;

function extractTitle(content: string, fallback: string): string {
  const heading = /^#\s+(.+)$/m.exec(content);
  return heading ? heading[1].trim() : fallback;
}

function extractStatus(content: string): string | null {
  const lines = content.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const heading = /^(#{1,6})\s+status\s*$/i.exec(lines[index].trim());
    if (!heading) continue;

    const depth = heading[1].length;
    for (let next = index + 1; next < lines.length; next += 1) {
      const line = lines[next].trim();
      if (!line) continue;

      const nextHeading = /^(#{1,6})\s+/.exec(line);
      if (nextHeading && nextHeading[1].length <= depth) return null;

      return line.replace(/^[-*]\s+/, "");
    }
    return null;
  }

  const frontMatter = /^---\s*\n([\s\S]*?)\n---/.exec(content);
  const status = frontMatter?.[1].match(/^status\s*:\s*(.+)$/im)?.[1];
  return status?.trim() ?? null;
}

function isAcceptedStatus(status: string | null): boolean {
  if (!status) return false;
  const normalized = status.toLowerCase().trim();
  return /^(accepted|angenommen|akzeptiert|approved|beschlossen)\b/.test(
    normalized,
  );
}

async function loadFrom(
  dir: string,
  origin: RuleOrigin,
  repoPrefix?: string,
): Promise<AdrDocument[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }

  const documents: AdrDocument[] = [];
  for (const entry of entries.sort()) {
    if (!ADR_FILE.test(entry) || NON_ADR.test(entry)) continue;
    const content = await readFile(join(dir, entry), "utf8");
    if (content.trim().length === 0) continue;

    const status = extractStatus(content);
    if (!isAcceptedStatus(status)) {
      log.info("adr_skipped_status", {
        file: entry,
        status: status ?? "(kein Status)",
      });
      continue;
    }
    const acceptedStatus = status ?? "accepted";

    documents.push({
      file: entry,
      repoPath: repoPrefix ? `${repoPrefix}/${entry}` : undefined,
      title: extractTitle(content, entry),
      content,
      origin,
      status: acceptedStatus,
    });
  }
  return documents;
}

export interface RuleBase {
  origin: RuleOrigin;
  documents: AdrDocument[];
  /** Pfade, die aus dem Suchraum genommen werden (FA-5). */
  excludedPaths: string[];
}

export async function loadRuleBase(): Promise<RuleBase> {
  const projectDir = join(config.repoDir, config.projectAdrDir);
  const projectDocs = await loadFrom(
    projectDir,
    "project",
    config.projectAdrDir,
  );

  if (projectDocs.length > 0) {
    log.info("rulebase_selected", {
      origin: "project",
      dir: config.projectAdrDir,
      documents: projectDocs.length,
    });
    return {
      origin: "project",
      documents: projectDocs,
      excludedPaths: projectDocs
        .map((doc) => doc.repoPath)
        .filter((p): p is string => Boolean(p)),
    };
  }

  const groupDocs = await loadFrom(config.groupStandardDir, "group");
  log.info("rulebase_selected", {
    origin: "group",
    dir: config.groupStandardDir,
    documents: groupDocs.length,
    reason: "keine projektspezifischen ADRs gefunden",
  });

  // Der Gruppenstandard liegt außerhalb des geklonten Baums und ist damit
  // ohnehin nicht Teil des Suchraums.
  return { origin: "group", documents: groupDocs, excludedPaths: [] };
}
