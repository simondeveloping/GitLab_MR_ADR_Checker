/**
 * Einstiegspunkt für die drei schreibgeschützten Werkzeuge des Agenten (NFA-6).
 *
 * `list_files` und `grep` gehören dem Locator, `read_file` dem Reader. Diese
 * Rollen halten Such- und Lesezugriffe im Werkzeugprotokoll unterscheidbar.
 * Die Implementierung liegt in tools/operations.ts, der gemeinsame
 * Repository-Zugriff in tools/repository.ts und die Modellschemas in
 * tools/definitions.ts.
 */
import { listFiles, grep, readFileTool, type ToolContext } from "./tools/operations.js";

export { listFiles, grep, readFileTool, type ToolContext } from "./tools/operations.js";
export { setBaseSha, setExcludedAdrPaths, loadEvidenceSnippet } from "./tools/repository.js";
export { LOCATOR_TOOLS, READER_TOOLS } from "./tools/definitions.js";

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
