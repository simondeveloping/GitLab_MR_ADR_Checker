/**
 * Modellzugang (Abschnitt 7.1, NFA-1).
 *
 * Die Agentenschleife ist direkt gegen die Chat-Completions-Schnittstelle des
 * Gateways implementiert, ohne Framework. Das hält Werkzeugauswahl,
 * Schrittgrenze und Protokollierung vollständig kontrollierbar - genau die
 * drei Punkte, an denen die verfügbaren Dienste ausscheiden. Gebunden ist der
 * Prototyp damit an kein bestimmtes Modell, sondern nur an eine
 * OpenAI-kompatible Schnittstelle.
 */

import { config } from "./config.js";
import { log, recordModelCall } from "./trace.js";

export interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export type Message =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: RawToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

interface RawToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface Completion {
  content: string | null;
  toolCalls: ToolCall[];
  /** Rohform der Assistant-Nachricht, die zurück in den Verlauf muss. */
  raw: Message;
}

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ein Aufruf der Chat-Completions-Schnittstelle.
 *
 * Transportfehler werden begrenzt wiederholt; ein inhaltlich unbrauchbares
 * Ergebnis wird nicht wiederholt, sondern nach oben gereicht, damit es als
 * Fehlschlag protokolliert werden kann statt still als leeres Urteil
 * durchzugehen (NFA-2).
 */
export async function complete(
  messages: Message[],
  options: { tools?: ToolSchema[]; jsonOnly?: boolean } = {},
): Promise<Completion> {
  const body: Record<string, unknown> = {
    model: config.llmModel,
    messages,
    // Ohne feste Temperatur streut jede der vier Modellstufen fuer sich, und
    // die Streuung summiert sich ueber den Lauf (Abschnitt 7.2.4).
    temperature: config.temperature,
  };

  if (config.seed !== undefined) body.seed = config.seed;

  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
    body.tool_choice = "auto";
  }

  if (options.jsonOnly) {
    body.response_format = { type: "json_object" };
  }

  let lastError = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1));

    let response: Response;
    try {
      response = await fetch(`${config.llmBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.llmApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(180_000),
      });
    } catch (error) {
      lastError = `Transportfehler: ${String(error)}`;
      continue;
    }

    if (!response.ok) {
      lastError = `HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`;
      if (RETRYABLE.has(response.status)) continue;
      throw new Error(lastError);
    }

    const payload = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: RawToolCall[];
        };
      }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const message = payload.choices?.[0]?.message;
    if (!message) {
      lastError = "Antwort ohne choices[0].message";
      continue;
    }

    recordModelCall(
      payload.usage?.prompt_tokens ?? 0,
      payload.usage?.completion_tokens ?? 0,
    );
    log.info("model_call", {
      model: config.llmModel,
      promptTokens: payload.usage?.prompt_tokens,
      completionTokens: payload.usage?.completion_tokens,
      toolCalls: message.tool_calls?.length ?? 0,
    });

    return {
      content: message.content ?? null,
      toolCalls: (message.tool_calls ?? []).map((call) => ({
        id: call.id,
        name: call.function.name,
        arguments: call.function.arguments,
      })),
      raw: {
        role: "assistant",
        content: message.content ?? null,
        tool_calls: message.tool_calls,
      },
    };
  }

  throw new Error(`Modellaufruf endgültig fehlgeschlagen: ${lastError}`);
}

/**
 * Zieht ein JSON-Objekt aus einer Modellantwort.
 *
 * Modelle umrahmen JSON gern mit Code-Fences oder erklärendem Text. Beides
 * wird toleriert; alles Übrige gilt als nicht formatgerechte Antwort und
 * führt zu `null`, damit der Aufrufer sie verwerfen und als Fehlschlag
 * protokollieren kann (NFA-2).
 */
export function parseJsonObject<T>(content: string | null): T | null {
  if (!content) return null;

  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(content);
  const candidates = [fenced?.[1], content].filter(
    (value): value is string => typeof value === "string",
  );

  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    try {
      return JSON.parse(trimmed) as T;
    } catch {
      // Zweiter Versuch: erstes vollständiges Objekt aus dem Fließtext.
      const start = trimmed.indexOf("{");
      const end = trimmed.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(trimmed.slice(start, end + 1)) as T;
        } catch {
          // nächster Kandidat
        }
      }
    }
  }

  return null;
}
