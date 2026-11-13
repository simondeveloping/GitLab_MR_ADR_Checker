import { appendFile, mkdir, rename, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

const MAX_LOG_BYTES = 1024 * 1024;
const MAX_FIELD_LENGTH = 1000;
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
