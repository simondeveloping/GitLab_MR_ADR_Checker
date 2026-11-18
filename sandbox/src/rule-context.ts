import type { Rule } from "./types.js";

// Vollständiger ADR-Kontext nur im Arbeitsspeicher, nicht je Befund speichern.
const contexts = new WeakMap<Rule, string>();
export function attachRuleContext(rule: Rule, context: string): Rule {
  contexts.set(rule, context);
  return rule;
}

/** Je Dokument nur einmal Kontext im Prompt, selbst bei mehreren Regeln. */
export function ruleInput(rules: Rule[]): string {
  const documents = new Map<string, { adr: string; origin: string; context: string }>();
  for (const rule of rules) {
    const context = contexts.get(rule);
    if (context) documents.set(`${rule.origin}:${rule.adrFile}`, { adr: rule.adrFile, origin: rule.origin, context });
  }
  return JSON.stringify({
    rules: rules.map((rule) => ({ id: rule.id, text: rule.text, adr: rule.adrFile, origin: rule.origin, adrSource: rule.adrSource })),
    documents: [...documents.values()],
  });
}

export function batchRules(rules: Rule[], maxCount = 8): Rule[][] {
  const batches: Rule[][] = [];
  let batch: Rule[] = [];
  for (const rule of rules) {
    if (batch.length && (batch.length >= maxCount || Buffer.byteLength(ruleInput([...batch, rule])) > 56_000)) {
      batches.push(batch);
      batch = [];
    }
    batch.push(rule);
  }
  if (batch.length) batches.push(batch);
  return batches;
}
