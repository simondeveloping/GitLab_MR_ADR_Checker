/**
 * Anbindung an GitLab (Abschnitt 7.1, Tabelle 7.2).
 *
 * Für Metadaten und Diffs kommt `@gitbeaker/rest` zum Einsatz. Die
 * Inline-Diskussion verlangt eine vollständige Positionsangabe aus Datei-,
 * Ausgangs- und Zielstand des Diffs; diesen Teil bildet der Client nicht ab,
 * weshalb er hier direkt gegen die Discussions-Schnittstelle der REST-API
 * gefahren wird.
 */

import { Gitlab } from "@gitbeaker/rest";
import { gitLabCredentials } from "./env";
import type { MergeRequestContext } from "./types";

function client(repoUrl: string) {
  const credentials = gitLabCredentials(repoUrl);
  return new Gitlab({ host: credentials.host, token: credentials.token });
}

/**
 * Lädt die Angaben nach, die der Webhook nicht verlässlich mitliefert, allen
 * voran `diff_refs` für die spätere Positionsangabe.
 */
export async function loadMergeRequestContext(
  projectId: number,
  mrIid: number,
  repoUrl: string,
): Promise<MergeRequestContext> {
  const api = client(repoUrl);
  const [mr, project] = await Promise.all([
    api.MergeRequests.show(projectId, mrIid),
    api.Projects.show(projectId),
  ]);

  const diffRefs = (mr as { diff_refs?: MergeRequestContext["diffRefs"] })
    .diff_refs;

  return {
    projectId,
    projectPath: String(project.path_with_namespace),
    repoUrl: String(project.http_url_to_repo),
    mrIid,
    title: String(mr.title),
    sourceBranch: String(mr.source_branch),
    targetBranch: String(mr.target_branch),
    sha: String(mr.sha),
    diffRefs,
    webUrl: String(mr.web_url),
  };
}

export interface MergeRequestDiff {
  new_path?: string;
  old_path?: string;
  deleted_file?: boolean;
  /** Der Hunk-Text der Datei; daraus ergeben sich die kommentierbaren Zeilen. */
  diff?: string;
}

/**
 * Die Diffs des Merge Requests, Datei für Datei. Die Inline-Positionierung
 * (`publish.ts`) liest daraus, welche Zeilen überhaupt kommentierbar sind.
 */
export async function listMergeRequestDiffs(
  projectId: number,
  mrIid: number,
  repoUrl: string,
): Promise<MergeRequestDiff[]> {
  const api = client(repoUrl);
  return (await api.MergeRequests.allDiffs(projectId, mrIid)) as MergeRequestDiff[];
}

/** Setzt den kurzlebigen Hinweiskommentar (Abschnitt 7.2.1). */
export async function createNote(
  projectId: number,
  mrIid: number,
  body: string,
  repoUrl: string,
): Promise<number> {
  const api = client(repoUrl);
  const note = await api.MergeRequestNotes.create(projectId, mrIid, body);
  return Number(note.id);
}

export async function deleteNote(
  projectId: number,
  mrIid: number,
  noteId: number,
  repoUrl: string,
): Promise<void> {
  const api = client(repoUrl);
  await api.MergeRequestNotes.remove(projectId, mrIid, noteId);
}

export interface DiscussionPosition {
  newPath: string;
  oldPath: string;
  newLine: number;
}

/**
 * Legt eine Inline-Diskussion an der betroffenen Codezeile an (FA-14).
 *
 * Gibt die Discussion-ID zurück oder `null`, wenn GitLab die Position
 * ablehnt. Letzteres tritt regelmäßig auf, wenn die Belegstelle in einer
 * Datei liegt, die der Merge Request gar nicht anfasst; der Aufrufer fällt
 * dann auf einen gewöhnlichen Kommentar zurück.
 */
export async function createInlineDiscussion(
  projectId: number,
  mrIid: number,
  body: string,
  diffRefs: NonNullable<MergeRequestContext["diffRefs"]>,
  position: DiscussionPosition,
  repoUrl: string,
): Promise<string | null> {
  const credentials = gitLabCredentials(repoUrl);
  const url =
    `${credentials.host}/api/v4/projects/${encodeURIComponent(String(projectId))}` +
    `/merge_requests/${mrIid}/discussions`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "PRIVATE-TOKEN": credentials.token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      body,
      position: {
        position_type: "text",
        base_sha: diffRefs.base_sha,
        head_sha: diffRefs.head_sha,
        start_sha: diffRefs.start_sha,
        new_path: position.newPath,
        old_path: position.oldPath,
        new_line: position.newLine,
      },
    }),
  });

  if (!response.ok) return null;
  const created = (await response.json()) as { id?: string };
  return created.id ?? null;
}

/** Gewöhnlicher Kommentar am Merge Request, wenn keine Position passt. */
export async function createFallbackComment(
  projectId: number,
  mrIid: number,
  body: string,
  repoUrl: string,
): Promise<string> {
  const api = client(repoUrl);
  const discussion = await api.MergeRequestDiscussions.create(
    projectId,
    mrIid,
    body,
  );
  return String(discussion.id);
}

/**
 * Klon-URL mit eingebettetem Token. Wird ausschließlich als Umgebungsvariable
 * an den Container übergeben, nie in ein Kommandozeilenargument, damit sie
 * nicht in der Prozessliste des Hosts auftaucht.
 */
export function authenticatedRepoUrl(repoUrl: string): string {
  const credentials = gitLabCredentials(repoUrl);
  const url = new URL(repoUrl);
  url.username = "oauth2";
  url.password = credentials.token;
  return url.toString();
}
