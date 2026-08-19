/** Konfiguration des Prüflaufs. Kommt vollständig aus der Umgebung. */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Umgebungsvariable ${name} fehlt.`);
  return value;
}

function number(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Wie `number`, laesst aber die 0 zu. */
function numberOrZero(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export const config = {
  reviewId: required("REVIEW_ID"),
  repoUrl: required("REPO_URL"),
  sha: required("MR_SHA"),
  targetBranch: required("MR_TARGET_BRANCH"),
  sourceBranch: process.env.MR_SOURCE_BRANCH ?? "",
  mrIid: process.env.MR_IID ?? "",

  callbackUrl: required("CALLBACK_URL"),
  callbackToken: required("CALLBACK_TOKEN"),

  llmBaseUrl: required("LLM_BASE_URL").replace(/\/+$/, ""),
  llmApiKey: required("LLM_API_KEY"),
  llmModel: process.env.LLM_MODEL ?? "gpt-5.4-mini",

  /**
   * Sampling-Temperatur jedes Modellaufrufs.
   *
   * Ohne Angabe setzt das Gateway seinen eigenen Vorgabewert, bei
   * OpenAI-kompatiblen Diensten in der Regel 1,0. Ein Prueflauf besteht aus
   * vier hintereinandergeschalteten Modellstufen (Extraktion, Vorfilter,
   * Locator, Reader); bei freier Stichprobe multipliziert sich deren Streuung,
   * bis schon die Zahl der gewonnenen Regeln von Lauf zu Lauf schwankt. Der
   * Vorgabewert 0 waehlt daher stets das wahrscheinlichste Folgetoken.
   */
  temperature: numberOrZero("LLM_TEMPERATURE", 0),

  /**
   * Optionaler Startwert des Samplings. Gateways, die ihn unterstuetzen,
   * liefern damit bei gleicher Anfrage dieselbe Antwort; nicht jedes Gateway
   * wertet das Feld aus, weshalb es nur gesendet wird, wenn es gesetzt ist.
   */
  seed:
    process.env.LLM_SEED && Number.isFinite(Number(process.env.LLM_SEED))
      ? Number(process.env.LLM_SEED)
      : undefined,

  /**
   * Werkzeugbudget je Regel (FA-7, Abschnitt 7.2.4).
   *
   * Die Vorgabewerte sind der Knick der Sättigungskurve aus Abschnitt 6.6.4:
   * acht Suchrunden, fünf Datei-Öffnungen, zwei Nachsuchen. Beide Richtungen
   * sind teuer - ein zu kleines Budget lässt den Vorteil des Werkzeugzugriffs
   * fast vollständig zusammenschrumpfen, ein zu großes kostet Laufzeit ohne
   * Gegenwert und verleitet das Modell dazu, schwache Indizien
   * überzuinterpretieren.
   */
  budget: {
    searchRounds: number("BUDGET_SEARCH_ROUNDS", 8),
    fileReads: number("BUDGET_FILE_READS", 5),
    refetches: number("BUDGET_REFETCHES", 2),
  },

  /**
   * Mehrere ADRs und Regeln sind unabhängige Prüfeinheiten. Begrenzte
   * Parallelität verkürzt die Wandzeit, ohne das Modellgateway unkontrolliert
   * zu überlasten.
   */
  concurrency: {
    extraction: number("EXTRACTION_CONCURRENCY", 3),
    judging: number("JUDGING_CONCURRENCY", 3),
  },

  /** Arbeitsverzeichnis im Container; verschwindet mit ihm. */
  workDir: process.env.WORK_DIR ?? "/work",
  repoDir: process.env.REPO_DIR ?? "/work/repo",
  /** Organisationsweite Regelbasis, im Image mitgeliefert (FA-3). */
  groupStandardDir: process.env.GROUP_STANDARD_DIR ?? "/opt/adr-standard",
  /** Verzeichnis der projektspezifischen ADRs im geklonten Repository. */
  projectAdrDir: process.env.PROJECT_ADR_DIR ?? "docs/adr",
  /** Der Änderungssatz als Datei im Suchraum (Abschnitt 7.2.1). */
  patchFile: "mr_diff.patch",
};

export type Config = typeof config;
