/**
 * Callback-Typen, deckungsgleich mit dem entsprechenden Teil von `src/lib/types.ts`.
 *
 * Die Sandbox wird als eigenes Container-Image gebaut und darf deshalb nicht
 * auf das Next.js-Projekt zugreifen. Ändert sich das Callback-Format, sind
 * beide Dateien anzupassen; `tests/contracts.ts` prüft ihre Übereinstimmung.
 */

export type Verdict = "C" | "NC" | "CIA";

export type RuleOrigin = "project" | "group" | "learning";
export type RuleBaseOrigin = RuleOrigin | "combined";

export interface Rule {
  id: string;
  text: string;
  adrTitle: string;
  adrFile: string;
  origin: RuleOrigin;
  /** Wörtliche, am Original-ADR geprüfte Grundlage der Regel. */
  adrSource?: { startLine: number; endLine: number; quote: string };
}

export interface Evidence {
  path: string;
  revision?: "base";
  startLine: number;
  endLine: number;
  why?: string;
  snippet?: {
    startLine: number;
    lines: string[];
  };
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
  /** Folge und Korrektur bestätigter ADR- oder Lernbefunde. */
  consequence?: string;
  suggestion?: string;
  evidence: Evidence[];
  /** Bestätigte Änderung; side=old bezeichnet eine gelöschte Zeile. */
  anchor?: { path: string; line: number; side?: "old" };
  coverage?: { status: "no_violation" | "incomplete"; searches: number; reads: number; rejectedCandidates: number };
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
  cacheHit?: boolean;
}

export interface DroppedRule {
  rule: Rule;
  reason: string;
}

export interface AgentFailure {
  stage: "extract" | "triage" | "locator" | "reader" | "learning";
  ruleId?: string;
  message: string;
}

/** Kompakte Laufdaten des Lernmodus, ohne gespeicherte Modell-Zwischenberichte. */
export interface LearningStats {
  collectionMs: number;
  integrationMs: number;
  verificationMs: number;
  deduplicationMs: number;
  formattingMs: number;
  chunks: number;
  incompleteUnits: number;
  candidates: number;
  confirmed: number;
  rejected: number;
  inconclusive: number;
  verificationErrors: number;
  invalidCandidates: number;
  integrationReason: "always" | "multiple_parts" | "incomplete" | "interfaces" | "broad_change" | "local_complete" | "no_changes";
  /** Höchstens zehn Beispiele mit jeweils höchstens 400 Zeichen Begründung. */
  openIssues: Array<{ path: string; line: number; side?: "old"; reason: string }>;
}

export interface SandboxResult {
  reviewId: string;
  mode: "architecture" | "learning";
  ruleOrigin: RuleBaseOrigin;
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
    modelMs?: number;
    retries?: number;
    models?: { default: string; fast: string; verify: string };
    architecture?: { searchMs: number; integrationMs: number; verificationMs: number; deduplicationMs: number; candidates: number; confirmed: number };
    learning?: LearningStats;
    averageTokensPerCheckedRule?: number;
    averageTokensPerAdr?: number;
    phases?: {
      checkoutMs?: number;
      rulebaseMs?: number;
      extractionMs?: number;
      triageMs?: number;
      judgingMs?: number;
      analysisMs?: number;
    };
  };
}
