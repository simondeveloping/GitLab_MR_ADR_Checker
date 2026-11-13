/**
 * Schritt 2 der Pipeline: Regelbasis (Abschnitt 7.2.2, FA-3).
 *
 * Die Sandbox sucht zuerst nach gültigen, angenommenen Projekt-ADRs unter
 * `docs/adr/`. Nur wenn sie mindestens eines findet, ergänzt sie diese um die
 * organisationsweiten Gruppenstandards. Ohne Projekt-ADRs wird stattdessen
 * der Lernmodus verwendet; Gruppenstandards allein schalten keinen
 * Architektur-Review frei.
 */

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config.js";
import { log } from "./trace.js";
import type { RuleBaseOrigin, RuleOrigin } from "./types.js";

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
  mode: "architecture" | "learning";
  origin: RuleBaseOrigin;
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
    const groupDocs = await loadFrom(config.groupStandardDir, "group");
    const documents = [...projectDocs, ...groupDocs];
    const origin = groupDocs.length > 0 ? "combined" : "project";
    log.info("rulebase_selected", {
      mode: "architecture",
      origin,
      dir: config.projectAdrDir,
      documents: projectDocs.length,
      groupDocuments: groupDocs.length,
    });
    return {
      mode: "architecture",
      origin,
      documents,
      excludedPaths: documents
        .map((doc) => doc.repoPath)
        .filter((p): p is string => Boolean(p)),
    };
  }

  log.info("rulebase_selected", {
    mode: "learning",
    origin: "learning",
    projectDocuments: 0,
    groupDocuments: 0,
    reason: "keine gültigen projektspezifischen ADRs gefunden",
  });

  // Ohne Projekt-ADRs wird nicht still auf Architekturregeln zurückgefallen:
  // der Lern-Review prüft konkrete Änderungen und erklärt mögliche Folgen.
  return { mode: "learning", origin: "learning", documents: [], excludedPaths: [] };
}
