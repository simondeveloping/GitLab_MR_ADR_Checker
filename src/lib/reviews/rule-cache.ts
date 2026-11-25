/** Kleiner, entbehrlicher ADR-Cache im vorhandenen Datenverzeichnis. */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, rmdir, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { env } from "../env";
import { createKeyedQueue } from "../keyed-queue";

export const RULE_CACHE_MAX_BYTES = 2 * 1024 * 1024;
export const RULE_CACHE_MAX_ENTRIES = 128;
export const RULE_CACHE_ENTRY_BYTES = 64 * 1024;
export const RULE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface CachedRule {
  text: string;
  adrSource: { startLine: number; endLine: number; quote: string };
}
interface Entry { key: string; expiresAt: number; usedAt: number; rules: CachedRule[] }
const queue = createKeyedQueue();

export function validCachedRules(value: unknown): value is CachedRule[] {
  return Array.isArray(value) && value.length <= 128 && value.every((raw) => {
    if (!raw || typeof raw !== "object") return false;
    const source = raw.adrSource;
    return typeof raw.text === "string" && raw.text.length >= 10 && raw.text.length <= 1200 &&
      source && Number.isInteger(source.startLine) && source.startLine > 0 &&
      Number.isInteger(source.endLine) && source.endLine >= source.startLine &&
      source.endLine - source.startLine <= 4 && typeof source.quote === "string" &&
      source.quote.length > 0 && source.quote.length <= 600;
  });
}

/** Eine Datei plus eine begrenzte atomare Ersatzdatei; keine neuen Volumes.
 * Auch zwischen Next-Workern exklusiv. Bei belegtem Lock lieber Cache-Miss
 * statt Warten. Ein nach Prozessabbruch verbliebener Lock verfällt nach 5 min.
 */
export async function accessRuleCache(scope: string, key: string, rules?: CachedRule[]): Promise<CachedRule[] | null> {
  if (process.env.ADR_RULE_CACHE === "0" || !/^[a-f0-9]{64}$/.test(key) || !/^[a-f0-9]{64}$/.test(scope)) return null;
  const target = resolve(env.dataDir, "adr-rule-cache.json");
  return queue(target, async () => {
    const lock = `${target}.lock`;
    const temporary = `${target}.tmp`;
    const owner = randomUUID();
    let acquired = false;
    try {
      await mkdir(resolve(env.dataDir), { recursive: true });
      const existingLock = await stat(lock).catch(() => null);
      if (existingLock && Date.now() - existingLock.mtimeMs > 300_000) {
        // Nur der Gewinner darf den alten Besitzer entfernen. Ein zweiter
        // Aufräumer darf niemals rekursiv den Lock eines neuen Writers löschen.
        const owners = await readdir(lock);
        if (owners.length > 1 || (owners.length === 1 && !/^[a-f0-9-]{36}$/.test(owners[0]))) return null;
        try {
          if (owners.length) await rm(resolve(lock, owners[0]));
          await rmdir(lock);
        } catch { return null; }
      }
      try { await mkdir(lock); acquired = true; } catch { return null; }
      await writeFile(resolve(lock, owner), "", { flag: "wx" });
      const now = Date.now();
      let entries: Entry[] = [];
      const info = await stat(target).catch(() => null);
      if (info && info.size <= RULE_CACHE_MAX_BYTES) {
        try {
          const parsed: unknown = JSON.parse(await readFile(target, "utf8"));
          if (Array.isArray(parsed)) entries = parsed.filter((entry): entry is Entry =>
            entry && typeof entry.key === "string" && /^[a-f0-9]{128}$/.test(entry.key) &&
            Number.isFinite(entry.expiresAt) && entry.expiresAt > now && entry.expiresAt <= now + RULE_CACHE_TTL_MS &&
            Number.isFinite(entry.usedAt) && validCachedRules(entry.rules));
        } catch { /* Beschädigter Cache ist ein Miss. */ }
      }
      const scopedKey = scope + key;
      const hit = entries.find((entry) => entry.key === scopedKey);
      if (hit) hit.usedAt = now;
      if (rules !== undefined && validCachedRules(rules) && Buffer.byteLength(JSON.stringify(rules)) <= RULE_CACHE_ENTRY_BYTES) {
        // Keine fremden Zusatzfelder oder vollständigen ADR-Dokumente übernehmen.
        const compact = rules.map(({ text, adrSource: { startLine, endLine, quote } }) =>
          ({ text, adrSource: { startLine, endLine, quote } }));
        entries = entries.filter((entry) => entry.key !== scopedKey);
        entries.push({ key: scopedKey, expiresAt: now + RULE_CACHE_TTL_MS, usedAt: now, rules: compact });
      }
      entries.sort((a, b) => b.usedAt - a.usedAt);
      entries = entries.slice(0, RULE_CACHE_MAX_ENTRIES);
      let body = JSON.stringify(entries);
      while (Buffer.byteLength(body) > RULE_CACHE_MAX_BYTES) {
        entries.pop();
        body = JSON.stringify(entries);
      }
      if (entries.length) {
        await writeFile(temporary, body, { mode: 0o600 });
        await rename(temporary, target);
      } else {
        await rm(target, { force: true });
      }
      return hit?.rules ?? null;
    } catch {
      return null;
    } finally {
      if (acquired) {
        await rm(temporary, { force: true }).catch(() => undefined);
        await rm(resolve(lock, owner), { force: true }).then(() => rmdir(lock)).catch(() => undefined);
      }
    }
  });
}
