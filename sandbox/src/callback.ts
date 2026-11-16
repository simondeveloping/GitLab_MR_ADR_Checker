import { setTimeout as delay } from "node:timers/promises";
import { config } from "./config.js";
import { log } from "./trace.js";
import type { SandboxResult } from "./types.js";

/** Überträgt das fertige Ergebnis unabhängig vom gewählten Prüfmodus. */
export async function sendCallback(result: SandboxResult): Promise<void> {
  const body = JSON.stringify(result);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await delay(2000 * attempt);
    try {
      const response = await fetch(config.callbackUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.callbackToken}`,
          "Content-Type": "application/json",
        },
        body,
        signal: AbortSignal.timeout(120_000),
      });
      if (response.ok) {
        log.info("callback_sent", { status: response.status });
        return;
      }
      log.warn("callback_rejected", {
        status: response.status,
        body: (await response.text()).slice(0, 500),
      });
    } catch (error) {
      log.warn("callback_failed", { attempt, error: String(error) });
    }
  }
  throw new Error("Callback an das Backend endgültig fehlgeschlagen.");
}
