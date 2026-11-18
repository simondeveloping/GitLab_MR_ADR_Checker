import { config } from "./config.js";

/** Best-effort über den vorhandenen authentifizierten Callback-Kanal. */
export async function ruleCache(key: string, rules?: unknown[]): Promise<unknown[] | null> {
  if (!config.ruleCache) return null;
  try {
    const response = await fetch(config.callbackUrl.replace(/\/callback\/?$/, "/rule-cache"), {
      method: "POST",
      headers: { Authorization: `Bearer ${config.callbackToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ key, ...(rules === undefined ? {} : { rules }) }),
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) return null;
    const value = await response.json() as { rules?: unknown };
    return Array.isArray(value.rules) ? value.rules : null;
  } catch { return null; }
}
