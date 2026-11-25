/**
 * Datenmodell des Prototyps.
 *
 * Die Typen dieser Datei beschreiben genau das, was zwischen Sandbox und
 * Backend über den HTTP-Callback läuft (Abschnitt 7.2.5), sowie die Form,
 * in der ein Review im Backend abgelegt wird. Die Sandbox hält in
 * `sandbox/src/types.ts` eine Kopie der Callback-Typen, damit sie unabhängig
 * vom Next.js-Projekt gebaut werden kann. `tests/contracts.ts` prüft die Übereinstimmung.
 */

/** Dreiwertiges Urteil je Regel (FA-8). Nur `NC` erzeugt einen Kommentar. */
export type Verdict = "C" | "NC" | "CIA";

/** Herkunft einer Regel: Projekt-ADR, Gruppenstandard oder Lernmodus. */
export type RuleOrigin = "project" | "group" | "learning";
export type RuleBaseOrigin = RuleOrigin | "combined";

/** Einzelne ADR-Regel oder synthetische Regel für einen bestätigten Lernhinweis. */
export interface Rule {
  id: string;
  /** Imperative ADR-Regel oder Titel des Lernhinweises. */
  text: string;
  /** Titel des Herkunfts-ADR, wandert in den Kommentartext. */
  adrTitle: string;
  /** Dateiname des Herkunfts-ADR, etwa `001-datenbank.md`. */
  adrFile: string;
  origin: RuleOrigin;
  /** Wörtliche, am Original-ADR geprüfte Grundlage der Regel. */
  adrSource?: { startLine: number; endLine: number; quote: string };
}

/** Originalstelle mit Codestand und Zeilenbereich für einen Befund. */
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

/** Konkreter Befund zu einer Regel oder regelbezogenes Ergebnis ohne bestätigten Verstoß. */
export interface Finding {
  id: string;
  rule: Rule;
  verdict: Verdict;
  /** Verifizierte Begründung bzw. Beschreibung der begrenzten Prüfaussage. */
  rationale: string;
  /** Folge und Korrektur bestätigter ADR- oder Lernbefunde. */
  consequence?: string;
  suggestion?: string;
  /** Belegstelle; bei `C` und `NC` verpflichtend, bei `CIA` meist leer. */
  evidence: Evidence[];
  /** Bestätigte Änderung; side=old bezeichnet eine gelöschte Zeile. */
  anchor?: { path: string; line: number; side?: "old" };
  coverage?: { status: "no_violation" | "incomplete"; searches: number; reads: number; rejectedCandidates: number };
  trace: ToolCallTrace[];
  /**
   * Das Werkzeug-/Kontextbudget der Verifikation bzw. einer Regelsuche war aufgebraucht.
   *
   * Wird protokolliert, aber weder am Merge Request noch auf der Detailseite
   * ausgewiesen: Die Marke traf in den Messläufen auf 94 % aller Befunde zu
   * und trennte damit sichere von unsicheren Urteilen nicht.
   */
  budgetExhausted: boolean;
  /** Modellaufrufe der Einzelverifikation; gemeinsame Suchkosten stehen in der Laufstatistik. */
  modelCalls: number;
  /** Tokenverbrauch der Einzelverifikation. */
  tokenUsage?: TokenUsage;
}

export interface AdrTokenUsage extends TokenUsage {
  adrFile: string;
  adrTitle: string;
  extractedRules: number;
  cacheHit?: boolean;
}

/** Regel, die der Vorfilter vor der Prüfung ausgeschlossen hat (FA-4). */
export interface DroppedRule {
  rule: Rule;
  reason: string;
}

/** Analysefehler einer Phase, etwa eine ungültige Modellantwort oder ein fehlender Pflichtbeleg. */
export interface AgentFailure {
  /** `triage` heißt in der Oberfläche "Vorfilter"; siehe `STAGE_LABEL`. */
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

/** Nutzlast des Callbacks aus der Sandbox an das Backend. */
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
  /** Lernfreundliche ADR-Erklärung für den MR-Autor; fehlt bei älteren Reviews (= false).
   * Beeinflusst nicht die Auswahl von architecture/learning anhand der Projekt-ADRs. */
  learningExplanation?: boolean;
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
  /** Sammelkommentar am Merge Request mit der Anzahl der Verstöße. */
  summaryDiscussionId?: string;
  feedback: FeedbackEntry[];
  error?: string;
  sandboxLog?: string;
  sandboxProgress?: {
    phase: string;
    message: string;
    percent: number;
    updatedAt: string;
    currentRule?: number;
    totalRules?: number;
    completedUnits?: number;
    totalUnits?: number;
  };
  sandboxStartedAt?: string;
  sandboxHeartbeatAt?: string;
  sandboxContainerName?: string;
  sandboxRuntime?: string;
  sandboxProcessId?: number;
}
