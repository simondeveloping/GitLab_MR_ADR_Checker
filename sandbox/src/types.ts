/**
 * Deckungsgleiche Kopie von `src/lib/types.ts` des Backends.
 *
 * Die Sandbox wird als eigenes Container-Image gebaut und darf deshalb nicht
 * auf das Next.js-Projekt zugreifen. Ändert sich das Callback-Format, sind
 * beide Dateien anzupassen.
 */

export type Verdict = "C" | "NC" | "CIA";

export type RuleOrigin = "project" | "group";

export interface Rule {
  id: string;
  text: string;
  adrTitle: string;
  adrFile: string;
  origin: RuleOrigin;
}

export interface Evidence {
  path: string;
  startLine: number;
  endLine: number;
  why?: string;
}

export interface ToolCallTrace {
  step: number;
  role: "locator" | "reader";
  tool: "list_files" | "grep" | "read_file";
  args: Record<string, unknown>;
  resultCount: number;
  durationMs: number;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface Finding {
  id: string;
  rule: Rule;
  verdict: Verdict;
  rationale: string;
  evidence: Evidence[];
  trace: ToolCallTrace[];
  /** Nur protokolliert, nicht mehr als Unsicherheitssignal ausgewiesen. */
  budgetExhausted: boolean;
  modelCalls: number;
  tokenUsage?: TokenUsage;
}

export interface AdrTokenUsage extends TokenUsage {
  adrFile: string;
  adrTitle: string;
  extractedRules: number;
}

export interface DroppedRule {
  rule: Rule;
  reason: string;
}

export interface AgentFailure {
  stage: "extract" | "triage" | "locator" | "reader";
  ruleId?: string;
  message: string;
}

export interface SandboxResult {
  reviewId: string;
  ruleOrigin: RuleOrigin;
  adrFiles: string[];
  changedFiles: string[];
  rules: Rule[];
  droppedRules: DroppedRule[];
  findings: Finding[];
  failures: AgentFailure[];
  adrTokenUsage?: AdrTokenUsage[];
  stats: {
    startedAt: string;
    finishedAt: string;
    durationMs: number;
    modelCalls: number;
    toolCalls: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    averageTokensPerCheckedRule?: number;
    averageTokensPerAdr?: number;
  };
}
