import { counters } from "./trace.js";
import { config } from "./config.js";
import type { SandboxResult } from "./types.js";

export function buildStats(
  startedAt: Date,
  checkedRules: number,
  phases: SandboxResult["stats"]["phases"],
  adrCount?: number,
): SandboxResult["stats"] {
  const finishedAt = new Date();
  return {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    modelCalls: counters.modelCalls,
    toolCalls: counters.toolCalls,
    promptTokens: counters.promptTokens,
    completionTokens: counters.completionTokens,
    totalTokens: counters.totalTokens,
    modelMs: counters.modelMs,
    retries: counters.retries,
    models: { default: config.llmModel, fast: config.fastModel, verify: config.verifyModel },
    phases,
    averageTokensPerCheckedRule: checkedRules > 0 ? counters.totalTokens / checkedRules : 0,
    ...(adrCount === undefined ? {} : {
      averageTokensPerAdr: adrCount > 0 ? counters.totalTokens / adrCount : 0,
    }),
  };
}
