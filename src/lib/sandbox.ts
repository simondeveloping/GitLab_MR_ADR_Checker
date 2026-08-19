/**
 * Start und Abbau der Prüf-Sandbox (Abschnitt 7.2.1).
 *
 * Je Merge Request entsteht ein eigener, ephemerer Container. Er trägt den
 * gesamten Prüfvorgang: Klonen, Diff erzeugen, Regeln gewinnen, Vorfilter,
 * Prüfung je Regel, Callback. Die Kapselung bedient dabei drei Anforderungen
 * zugleich - eigener Dateibaum, aus dem die Werkzeuge des Agenten nicht
 * ausbrechen können (NFA-6), kein Zustand von einem Review zum nächsten,
 * und ein Ort, an dem jeder Werkzeugaufruf protokolliert wird (NFA-3).
 */

import { spawn } from "node:child_process";
import { env } from "./env";
import { authenticatedRepoUrl } from "./gitlab";
import type { Review } from "./types";

export interface SandboxOutcome {
  exitCode: number | null;
  timedOut: boolean;
  log: string;
}

/**
 * Startet den Container und wartet, bis er endet. Der eigentliche Rückweg
 * läuft nicht über den Rückgabewert, sondern über den HTTP-Callback aus
 * dem Container heraus; hier interessiert nur, ob der Lauf sauber terminiert
 * ist und was er protokolliert hat.
 */
export function runSandbox(review: Review): Promise<SandboxOutcome> {
  const containerName = `adr-review-${review.id}`;

  // Alles Vertrauliche geht über die Umgebung, nicht über Argumente.
  const envPairs: Record<string, string> = {
    REVIEW_ID: review.id,
    REPO_URL: authenticatedRepoUrl(review.mr.repoUrl),
    MR_SHA: review.mr.sha,
    MR_SOURCE_BRANCH: review.mr.sourceBranch,
    MR_TARGET_BRANCH: review.mr.targetBranch,
    MR_IID: String(review.mr.mrIid),
    CALLBACK_URL: `${env.callbackBaseUrl}/api/reviews/${review.id}/callback`,
    CALLBACK_TOKEN: review.callbackToken,
    LLM_BASE_URL: env.llmBaseUrl,
    LLM_API_KEY: env.llmApiKey,
    LLM_MODEL: env.llmModel,
    LLM_TEMPERATURE: String(env.llmTemperature),
    BUDGET_SEARCH_ROUNDS: String(env.budget.searchRounds),
    BUDGET_FILE_READS: String(env.budget.fileReads),
    BUDGET_REFETCHES: String(env.budget.refetches),
    EXTRACTION_CONCURRENCY: String(env.concurrency.extraction),
    JUDGING_CONCURRENCY: String(env.concurrency.judging),
  };

  if (env.llmSeed !== undefined) envPairs.LLM_SEED = String(env.llmSeed);

  const args = [
    "run",
    "--rm",
    "--name",
    containerName,
    // Der Agent arbeitet ausschließlich lesend auf dem geklonten Baum; alles,
    // was er anlegt, liegt unter /work. Keine Rechteausweitung, keine
    // zusätzlichen Capabilities (NFA-6).
    "--security-opt",
    "no-new-privileges",
    "--cap-drop",
    "ALL",
    "--read-only",
    "--tmpfs",
    "/tmp:rw,exec,nosuid,size=256m",
    // Der Klon und die Patch-Datei brauchen beschreibbaren Platz, der mit dem
    // Container verschwindet.
    "--mount",
    "type=tmpfs,destination=/work,tmpfs-size=2g",
    "--memory",
    "2g",
    "--pids-limit",
    "512",
  ];

  for (const key of Object.keys(envPairs)) {
    args.push("--env", key);
  }

  args.push(env.sandboxImage);

  return new Promise((resolve) => {
    const child = spawn(env.sandboxRuntime, args, {
      env: { ...process.env, ...envPairs },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let log = "";
    const capture = (chunk: Buffer) => {
      log += chunk.toString();
      // Das Containerprotokoll ist die Grundlage jeder späteren Fehlersuche,
      // darf aber den Review-Datensatz nicht sprengen.
      if (log.length > 512_000) log = log.slice(-512_000);
    };
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      // `podman run --rm` räumt beim Kill selbst auf; der zusätzliche
      // Aufruf fängt den Fall ab, dass der Prozess den Container überlebt.
      spawn(env.sandboxRuntime, ["kill", containerName], {
        stdio: "ignore",
      }).on("error", () => undefined);
      child.kill("SIGKILL");
    }, env.sandboxTimeoutSeconds * 1000);

    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ exitCode: null, timedOut, log: `${log}\n${error.message}` });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code, timedOut, log });
    });
  });
}
