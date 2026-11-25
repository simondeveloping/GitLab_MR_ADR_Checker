import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const MAX_LOG_BYTES = 1024 * 1024;
const MAX_FIELD_LENGTH = 1000;
const LOG_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const LOG_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const SECRET_VALUES = [
  process.env.GITLAB_TOKEN,
  process.env.GITLAB_WEBHOOK_SECRET,
  process.env.LLM_API_KEY,
  ...(process.env.GITLAB_CONNECTIONS
    ? (() => {
      try {
        const parsed: unknown = JSON.parse(process.env.GITLAB_CONNECTIONS);
        if (!Array.isArray(parsed)) return [];
        return parsed.map((connection: unknown) =>
          connection && typeof connection === "object"
            ? (connection as { token?: unknown }).token
            : undefined,
        );
      } catch {
        return [];
      }
      })()
    : []),
].filter((value): value is string => typeof value === "string" && value.length > 0);

let writes = Promise.resolve();
let cleanupTimer: NodeJS.Timeout | undefined;

function redact(value: string): string {
  let safe = value
    .replace(/(Bearer\s+)[^\s"']+/gi, "$1[REDACTED]")
    .replace(/((?:token|secret|api[_-]?key|password)=)[^\s&]+/gi, "$1[REDACTED]");
  for (const secret of SECRET_VALUES) safe = safe.split(secret).join("[REDACTED]");
  return safe.slice(0, MAX_FIELD_LENGTH);
}

function sanitize(value: unknown): unknown {
  if (typeof value === "string") return redact(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }
  if (Array.isArray(value)) return value.slice(0, 20).map(sanitize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 30)
        .map(([key, item]) => [key, sanitize(item)]),
    );
  }
  return undefined;
}

async function pruneLogFile(path: string, cutoff: number): Promise<void> {
  let contents: string;
  try {
    contents = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }

  let removed = false;
  const retainedLines = contents.split(/\r?\n/).filter((line) => {
    if (!line) return false;
    try {
      const entry: unknown = JSON.parse(line);
      const timestamp = entry && typeof entry === "object"
        ? Date.parse(String((entry as { ts?: unknown }).ts ?? ""))
        : Number.NaN;
      if (Number.isFinite(timestamp) && timestamp < cutoff) {
        removed = true;
        return false;
      }
    } catch {
      // Preserve malformed lines: their age cannot be determined safely.
    }
    return true;
  });

  if (!removed) return;
  if (retainedLines.length === 0) {
    await unlink(path);
    return;
  }

  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${retainedLines.join("\n")}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryPath, path);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

/** Entfernt Einträge älter als 14 Tage aus den Betriebslogs und ihren Rotationen. */
export function pruneOperationalLogs(
  directory = resolve(process.cwd(), "logs"),
  now = Date.now(),
): Promise<void> {
  const cleanup = writes.then(async () => {
    const cutoff = now - LOG_RETENTION_MS;
    for (const file of ["application.log", "application.log.1", "containers.log", "containers.log.1"]) {
      // Laufzeitdaten vom Host, keine mitzuliefernden Build-Abhängigkeiten.
      await pruneLogFile(join(/* turbopackIgnore: true */ directory, file), cutoff);
    }
  });
  writes = cleanup.catch(() => undefined);
  return cleanup;
}

/** Startet die Bereinigung beim Serverstart und anschließend einmal täglich. */
export function scheduleOperationalLogCleanup(): void {
  if (cleanupTimer) return;

  const cleanup = () => {
    void pruneOperationalLogs().catch((error: unknown) => {
      console.error("Betriebslogs konnten nicht bereinigt werden:", error);
    });
  };
  cleanup();
  cleanupTimer = setInterval(cleanup, LOG_CLEANUP_INTERVAL_MS);
  cleanupTimer.unref();
}

/** Schreibt nur ausgewählte Betriebsereignisse; aktuelle Datei + eine Rotation. */
export function writeOperationalLog(
  file: "application.log" | "containers.log",
  entry: Record<string, unknown>,
): void {
  const safeEntry = sanitize(entry) as Record<string, unknown>;
  const line = `${JSON.stringify({ ts: new Date().toISOString(), ...safeEntry })}\n`;
  const path = join(resolve(process.cwd(), "logs"), file);
  writes = writes
    .then(async () => {
      await mkdir(resolve(process.cwd(), "logs"), { recursive: true });
      try {
        const info = await stat(path);
        if (info.size + Buffer.byteLength(line) > MAX_LOG_BYTES) {
          await rename(path, `${path}.1`);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      await appendFile(path, line, { encoding: "utf8", mode: 0o600 });
    })
    .catch(() => undefined);
}
