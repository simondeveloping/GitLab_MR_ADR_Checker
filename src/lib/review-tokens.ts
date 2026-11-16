import type { Review } from "./types";

export function reviewTokenBreakdown(review: Review): { prompt: number; completion: number } {
  const stats = review.result?.stats;
  if ((stats?.promptTokens ?? 0) + (stats?.completionTokens ?? 0) > 0) {
    return { prompt: stats?.promptTokens ?? 0, completion: stats?.completionTokens ?? 0 };
  }
  const usages = [
    ...(review.result?.adrTokenUsage ?? []),
    ...(review.result?.findings ?? []).map((finding) => finding.tokenUsage),
  ];
  return usages.reduce<{ prompt: number; completion: number }>((total, usage) => ({
    prompt: total.prompt + (usage?.promptTokens ?? 0),
    completion: total.completion + (usage?.completionTokens ?? 0),
  }), { prompt: 0, completion: 0 });
}

export function reviewTokenCount(review: Review): number {
  const statsTotal = review.result?.stats.totalTokens;
  if (typeof statsTotal === "number" && statsTotal > 0) return statsTotal;
  const { prompt, completion } = reviewTokenBreakdown(review);
  return prompt + completion;
}
