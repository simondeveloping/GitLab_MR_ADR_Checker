/** Zentrale Konfiguration. Fehlende Pflichtwerte fallen beim ersten Zugriff auf. */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Umgebungsvariable ${name} ist nicht gesetzt (siehe .env.example).`,
    );
  }
  return value;
}

function optionalNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  get gitlabHost() {
    return required("GITLAB_HOST").replace(/\/+$/, "");
  },
  get gitlabToken() {
    return required("GITLAB_TOKEN");
  },
  get webhookSecret() {
    return required("GITLAB_WEBHOOK_SECRET");
  },
  get llmBaseUrl() {
    return required("LLM_BASE_URL").replace(/\/+$/, "");
  },
  get llmApiKey() {
    return required("LLM_API_KEY");
  },
  get llmModel() {
    return process.env.LLM_MODEL ?? "gpt-5.4-mini";
  },
  /**
   * Sampling-Temperatur; 0 macht die Läufe vergleichbar. Ohne diesen Wert
   * greift der Vorgabewert des Gateways, und schon die Zahl der aus den ADRs
   * gewonnenen Regeln schwankt von Lauf zu Lauf.
   */
  get llmTemperature() {
    const raw = process.env.LLM_TEMPERATURE;
    if (!raw) return 0;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  },
  /** Optionaler Sampling-Startwert; wird nur weitergereicht, wenn gesetzt. */
  get llmSeed() {
    const raw = process.env.LLM_SEED;
    if (!raw) return undefined;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
  },
  get sandboxImage() {
    return process.env.SANDBOX_IMAGE ?? "adr-review-agent:latest";
  },
  get sandboxRuntime() {
    return process.env.SANDBOX_RUNTIME ?? "podman";
  },
  get sandboxTimeoutSeconds() {
    return optionalNumber("SANDBOX_TIMEOUT_SECONDS", 1800);
  },
  get callbackBaseUrl() {
    return (
      process.env.CALLBACK_BASE_URL ?? "http://host.containers.internal:3000"
    ).replace(/\/+$/, "");
  },
  /**
   * Basis-URL für die Links in den GitLab-Kommentaren. Sie muss aus dem
   * Browser der Entwickelnden erreichbar sein und ist daher in der Regel eine
   * andere als `callbackBaseUrl`, die nur aus dem Container heraus gilt.
   */
  get publicBaseUrl() {
    return (
      process.env.PUBLIC_BASE_URL ??
      process.env.CALLBACK_BASE_URL ??
      "http://localhost:3000"
    ).replace(/\/+$/, "");
  },
  /**
   * Werkzeugbudget je Regel. Die Vorgabewerte sind der Knick der
   * Sättigungskurve aus Abschnitt 6.6.4: acht Suchrunden, fünf
   * Datei-Öffnungen, zwei Nachsuchen.
   */
  get budget() {
    return {
      searchRounds: optionalNumber("BUDGET_SEARCH_ROUNDS", 8),
      fileReads: optionalNumber("BUDGET_FILE_READS", 5),
      refetches: optionalNumber("BUDGET_REFETCHES", 2),
    };
  },
  get concurrency() {
    return {
      extraction: optionalNumber("EXTRACTION_CONCURRENCY", 3),
      judging: optionalNumber("JUDGING_CONCURRENCY", 3),
    };
  },
  get dataDir() {
    return process.env.DATA_DIR ?? "./data";
  },
};
