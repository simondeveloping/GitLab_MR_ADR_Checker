/**
 * Protokollierung (NFA-3).
 *
 * Der Container ist der Ort, an dem jeder Werkzeugaufruf und jede
 * Modellantwort festgehalten werden. Erst weil die Kette der Zwischenschritte
 * sichtbar bleibt, lässt sich ein unplausibler Befund auf den Werkzeugaufruf
 * zurückführen, der ihn ausgelöst hat. Ausgabe ist zeilenweises JSON auf
 * stdout; das Backend hebt das Containerprotokoll beim Review auf.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { TokenUsage } from "./types.js";

export type LogFields = Record<string, unknown>;

function emit(level: string, event: string, fields: LogFields): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  });
  process.stdout.write(`${line}\n`);
}

export const log = {
  info: (event: string, fields: LogFields = {}) => emit("info", event, fields),
  warn: (event: string, fields: LogFields = {}) => emit("warn", event, fields),
  error: (event: string, fields: LogFields = {}) => emit("error", event, fields),
};

/** Zählt Modell- und Werkzeugaufrufe über den gesamten Lauf (NFA-7). */
export class Counters {
  modelCalls = 0;
  toolCalls = 0;
  promptTokens = 0;
  completionTokens = 0;

  get totalTokens(): number {
    return this.promptTokens + this.completionTokens;
  }
}

export const counters = new Counters();

/**
 * Verbrauch eines abgegrenzten Abschnitts, etwa der Prüfung einer einzelnen
 * Regel oder der Extraktion eines einzelnen ADR.
 */
export interface ScopedUsage extends TokenUsage {
  modelCalls: number;
}

type ScopeState = { modelCalls: number } & Omit<TokenUsage, "totalTokens">;

/**
 * Die Abschnitte laufen mit begrenzter Parallelität nebeneinander. Ein
 * einfacher Vorher-Nachher-Vergleich der globalen Zähler würde deshalb die
 * Aufrufe der jeweils gleichzeitig laufenden Regeln mitzählen. Der Speicher
 * hängt stattdessen am asynchronen Kontext, sodass jeder Aufruf genau dem
 * Abschnitt zugeschlagen wird, aus dem er stammt.
 */
const scopes = new AsyncLocalStorage<ScopeState>();

function snapshot(state: ScopeState): ScopedUsage {
  return {
    modelCalls: state.modelCalls,
    promptTokens: state.promptTokens,
    completionTokens: state.completionTokens,
    totalTokens: state.promptTokens + state.completionTokens,
  };
}

/** Verbucht einen Modellaufruf global und im umgebenden Abschnitt. */
export function recordModelCall(
  promptTokens = 0,
  completionTokens = 0,
): void {
  counters.modelCalls += 1;
  counters.promptTokens += promptTokens;
  counters.completionTokens += completionTokens;

  const scope = scopes.getStore();
  if (!scope) return;
  scope.modelCalls += 1;
  scope.promptTokens += promptTokens;
  scope.completionTokens += completionTokens;
}

/** Führt `fn` aus und meldet, was dabei an Modellaufrufen angefallen ist. */
export async function withUsageScope<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; usage: ScopedUsage }> {
  const state: ScopeState = {
    modelCalls: 0,
    promptTokens: 0,
    completionTokens: 0,
  };
  const result = await scopes.run(state, fn);
  return { result, usage: snapshot(state) };
}
