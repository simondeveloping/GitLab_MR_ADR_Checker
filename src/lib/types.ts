/**
 * Datenmodell des Prototyps.
 *
 * Die Typen dieser Datei beschreiben genau das, was zwischen Sandbox und
 * Backend über den HTTP-Callback läuft (Abschnitt 7.2.5), sowie die Form,
 * in der ein Review im Backend abgelegt wird. Die Sandbox hält in
 * `sandbox/src/types.ts` eine deckungsgleiche Kopie, damit sie unabhängig
 * vom Next.js-Projekt gebaut werden kann.
 */

/** Dreiwertiges Urteil je Regel (FA-8). Nur `NC` erzeugt einen Kommentar. */
export type Verdict = "C" | "NC" | "CIA";

/** Herkunft der Regelbasis: Projekt-ADRs oder Gruppenstandard (FA-3). */
export type RuleOrigin = "project" | "group";

/** Eine aus einem ADR gewonnene, einzeln entscheidbare Regel (FA-1). */
export interface Rule {
  id: string;
  /** Imperativer Satz mit genau einer Aussage. */
  text: string;
  /** Titel des Herkunfts-ADR, wandert in den Kommentartext. */
  adrTitle: string;
  /** Dateiname des Herkunfts-ADR, etwa `001-datenbank.md`. */
  adrFile: string;
  origin: RuleOrigin;
}

/** Belegstelle, die der Locator meldet und der Reader liest. */
export interface Evidence {
  path: string;
  startLine: number;
  endLine: number;
  why?: string;
}

/** Ein protokollierter Werkzeugaufruf (NFA-3). */
export interface ToolCallTrace {
  step: number;
  role: "locator" | "reader";
  tool: "list_files" | "grep" | "read_file";
  args: Record<string, unknown>;
  /** Zahl der Treffer bzw. gelesenen Zeilen; 0 kennzeichnet die Leersuche. */
  resultCount: number;
  durationMs: number;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** Ergebnis der Prüfung genau einer Regel auf genau einem Codestand. */
export interface Finding {
  id: string;
  rule: Rule;
  verdict: Verdict;
  /** Begründung des Readers, gehört zu jedem Urteil (FA-8). */
  rationale: string;
  /** Belegstelle; bei `C` und `NC` verpflichtend, bei `CIA` meist leer. */
  evidence: Evidence[];
  trace: ToolCallTrace[];
  /**
   * Das Werkzeugbudget dieser Regel war aufgebraucht (FA-7, Abschnitt 7.2.4).
   *
   * Wird protokolliert, aber weder am Merge Request noch auf der Detailseite
   * ausgewiesen: Die Marke traf in den Messläufen auf 94 % aller Befunde zu
   * und trennte damit sichere von unsicheren Urteilen nicht.
   */
  budgetExhausted: boolean;
  /** Zahl der Modellaufrufe für diese Regel (NFA-7). */
  modelCalls: number;
  /** Tokenverbrauch der Modellaufrufe für diese Regel. */
  tokenUsage?: TokenUsage;
}

export interface AdrTokenUsage extends TokenUsage {
  adrFile: string;
  adrTitle: string;
  extractedRules: number;
}

/** Regel, die der Vorfilter vor der Prüfung ausgeschlossen hat (FA-4). */
export interface DroppedRule {
  rule: Rule;
  reason: string;
}

/** Nicht formatgerechte Modellantwort; wird verworfen, nicht gewertet (NFA-2). */
export interface AgentFailure {
  /** `triage` heißt in der Oberfläche "Vorfilter"; siehe `STAGE_LABEL`. */
  stage: "extract" | "triage" | "locator" | "reader";
  ruleId?: string;
  message: string;
}

/** Nutzlast des Callbacks aus der Sandbox an das Backend. */
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

export type ReviewStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed";

/** Rückmeldung der Entwickelnden am einzelnen Befund (FA-15, Abschnitt 7.5). */
export interface FeedbackEntry {
  findingId: string;
  rating: "up" | "down";
  comment?: string;
  createdAt: string;
}

/** Merge-Request-Kontext, den der Webhook liefert bzw. die API nachlädt. */
export interface MergeRequestContext {
  projectId: number;
  projectPath: string;
  repoUrl: string;
  mrIid: number;
  title: string;
  sourceBranch: string;
  targetBranch: string;
  /** Commit, auf den die Sandbox auscheckt. */
  sha: string;
  /** Für Inline-Diskussionen zwingend (Abschnitt 7.3). */
  diffRefs?: {
    base_sha: string;
    head_sha: string;
    start_sha: string;
  };
  webUrl: string;
}

/** Vollständiger Review-Datensatz im Backend-Store. */
export interface Review {
  id: string;
  status: ReviewStatus;
  createdAt: string;
  updatedAt: string;
  mr: MergeRequestContext;
  /** Geheimnis, mit dem sich die Sandbox beim Callback ausweist. */
  callbackToken: string;
  /** Kurzlebiger Hinweiskommentar am MR (Abschnitt 7.2.1). */
  placeholderNoteId?: number;
  result?: SandboxResult;
  /** Wohin ein Befund kommentiert wurde: inline oder als MR-Kommentar. */
  publishedComments?: Array<{
    findingId: string;
    kind: "inline" | "fallback";
    discussionId?: string;
  }>;
  /** Sammelkommentar am Merge Request, der auf die Detailseite verweist. */
  summaryDiscussionId?: string;
  feedback: FeedbackEntry[];
  error?: string;
  sandboxLog?: string;
}
