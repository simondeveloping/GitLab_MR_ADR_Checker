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

export interface GitLabConnection {
  host: string;
  token: string;
  projects?: string[];
}

function configuredGitLabConnections(): GitLabConnection[] {
  const raw = process.env.GITLAB_CONNECTIONS;
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("GITLAB_CONNECTIONS muss gültiges JSON sein.");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("GITLAB_CONNECTIONS muss ein JSON-Array sein.");
  }

  return parsed.map((value, index) => {
    if (!value || typeof value !== "object") {
      throw new Error(`GITLAB_CONNECTIONS[${index}] ist ungültig.`);
    }
    const item = value as Record<string, unknown>;
    if (typeof item.host !== "string" || typeof item.token !== "string") {
      throw new Error(
        `GITLAB_CONNECTIONS[${index}] benötigt die Felder host und token.`,
      );
    }
    if (
      item.projects !== undefined &&
      (!Array.isArray(item.projects) ||
        item.projects.some((project) => typeof project !== "string"))
    ) {
      throw new Error(
        `GITLAB_CONNECTIONS[${index}].projects muss ein Array aus Projektpfaden sein.`,
      );
    }
    return {
      host: item.host.replace(/\/+$/, ""),
      token: item.token,
      projects: item.projects as string[] | undefined,
    };
  });
}

function projectKey(value: string): string {
  const url = new URL(value);
  return `${url.origin}${url.pathname.replace(/\/+$/, "").replace(/\.git$/i, "")}`;
}

/** Wählt die GitLab-Verbindung anhand der URL des betroffenen Repositorys. */
export function gitLabCredentials(repoUrl: string): GitLabConnection {
  const repoKey = projectKey(repoUrl);
  const repo = new URL(repoUrl);
  const connections = configuredGitLabConnections();
  const matchingProjects = connections.filter((connection) =>
    connection.projects?.some((project) => {
      if (/^https?:\/\//i.test(project)) return projectKey(project) === repoKey;
      const configuredHost = new URL(connection.host);
      const hostPath = configuredHost.pathname.replace(/\/$/, "");
      if (
        configuredHost.origin !== repo.origin ||
        (hostPath &&
          repo.pathname !== hostPath &&
          !repo.pathname.startsWith(`${hostPath}/`))
      ) {
        return false;
      }
      const projectPath = project
        .replace(/^\/+|\/+$/g, "")
        .replace(/\.git$/i, "");
      const repositoryPath = repo.pathname
        .slice(hostPath.length)
        .replace(/^\/+|\/+$/g, "")
        .replace(/\.git$/i, "");
      return repositoryPath === projectPath;
    }),
  );
  if (matchingProjects.length === 1) return matchingProjects[0];
  if (matchingProjects.length > 1) {
    throw new Error(`Mehrere GitLab-Verbindungen passen zu ${repoUrl}.`);
  }

  const matchingHosts = connections.filter((connection) => {
    if (connection.projects?.length) return false;
    const configuredHost = new URL(connection.host);
    const hostPath = configuredHost.pathname.replace(/\/$/, "");
    return (
      configuredHost.origin === repo.origin &&
      (!hostPath ||
        repo.pathname === hostPath ||
        repo.pathname.startsWith(`${hostPath}/`))
    );
  });
  if (matchingHosts.length === 1) return matchingHosts[0];
  if (matchingHosts.length > 1) {
    throw new Error(`Mehrere GitLab-Verbindungen passen zu ${repoUrl}.`);
  }
  if (connections.length > 0) {
    throw new Error(`Keine GitLab-Verbindung für Repository ${repoUrl} konfiguriert.`);
  }

  // Rückwärtskompatibilität zur bisherigen Einzel-Instanz-Konfiguration.
  const legacyHost = process.env.GITLAB_HOST?.replace(/\/+$/, "");
  const legacyToken = process.env.GITLAB_TOKEN;
  if (legacyHost && legacyToken) {
    const configuredHost = new URL(legacyHost);
    const hostPath = configuredHost.pathname.replace(/\/$/, "");
    if (
      configuredHost.origin === repo.origin &&
      (!hostPath ||
        repo.pathname === hostPath ||
        repo.pathname.startsWith(`${hostPath}/`))
    ) {
      return { host: legacyHost, token: legacyToken };
    }
  }

  throw new Error(`Keine GitLab-Verbindung für Repository ${repoUrl} konfiguriert.`);
}

export const env = {
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
