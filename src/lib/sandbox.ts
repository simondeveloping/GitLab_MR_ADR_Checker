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
import { writeOperationalLog } from "./operational-log";
import { SandboxProgressTracker } from "./sandbox-progress";
import { updateReview } from "./store";
import type { Review } from "./types";

export interface SandboxOutcome {
  exitCode: number | null;
  timedOut: boolean;
  runtimeError?: string;
}

function safeRuntimeError(value: string): string {
  return value
    .trim()
    .replace(/(https?:\/\/)[^/@\s]+:[^/@\s]+@/gi, "$1[REDACTED]@")
    .replace(/\b(?:glpat-|sk-)[^\s"'`]+/gi, "[REDACTED]")
    .slice(-1500);
}

/**
 * Startet den Container und wartet, bis er endet. Der eigentliche Rückweg
 * läuft nicht über den Rückgabewert, sondern über den HTTP-Callback aus
 * dem Container heraus; hier interessiert nur, ob der Lauf sauber terminiert
 * ist und was er protokolliert hat.
 */
export function runSandbox(review: Review): Promise<SandboxOutcome> {
  const containerName = `adr-review-${review.id}`;
  const startedAt = new Date().toISOString();

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
    LLM_FAST_MODEL: process.env.LLM_FAST_MODEL || env.llmModel,
    LLM_VERIFY_MODEL: process.env.LLM_VERIFY_MODEL || env.llmModel,
    ADR_RULE_CACHE: process.env.ADR_RULE_CACHE === "0" ? "0" : "1",
    ADR_LEARNING_EXPLANATION: review.learningExplanation === true ? "1" : "0",
    LLM_TEMPERATURE: String(env.llmTemperature),
    BUDGET_SEARCH_ROUNDS: String(env.budget.searchRounds),
    BUDGET_FILE_READS: String(env.budget.fileReads),
    BUDGET_REFETCHES: String(env.budget.refetches),
    LEARNING_BUDGET_SEARCH_ROUNDS: String(env.learningBudget.searchRounds),
    LEARNING_BUDGET_FILE_READS: String(env.learningBudget.fileReads),
    LEARNING_MAX_FINDINGS: String(env.learningBudget.maxFindings),
    LEARNING_CHUNK_BYTES: String(env.learningBudget.chunkBytes),
    LEARNING_CONCURRENCY: String(env.concurrency.learning),
    LEARNING_MODEL: process.env.LEARNING_MODEL || env.llmModel,
    LEARNING_VERIFY_MODEL: process.env.LEARNING_VERIFY_MODEL || process.env.LEARNING_MODEL || env.llmModel,
    LEARNING_DEDUP_MODEL: process.env.LEARNING_DEDUP_MODEL || process.env.LEARNING_MODEL || env.llmModel,
    LEARNING_INTEGRATION_MODE: process.env.LEARNING_INTEGRATION_MODE === "always" ? "always" : "auto",
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

  // In Compose, join the app's user-defined Podman network so the callback can
  // use the app service DNS name instead of hairpinning through the host.
  if (env.sandboxNetwork) {
    args.push("--network", env.sandboxNetwork);
  }

  for (const key of Object.keys(envPairs)) {
    args.push("--env", key);
  }

  args.push(env.sandboxImage);

  // Die Benutzernamenliste bleibt im Backend; auch der Runtime-Prozess erhält
  // nur die bereits getroffene Auswahl. In den Container gehen nur envPairs.
  const runtimeEnv = { ...process.env, ...envPairs };
  delete runtimeEnv.LEARNING_USERS;

  return new Promise((resolve) => {
    const child = spawn(env.sandboxRuntime, args, {
      env: runtimeEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const pendingLines = { stdout: "", stderr: "" };
    let stderrTail = "";
    const progress = new SandboxProgressTracker(startedAt);
    let persistChain = Promise.resolve();

    const persist = () => {
      const snapshot = { ...progress.snapshot };
      persistChain = persistChain
        .then(async () => {
          await updateReview(review.id, (stored) => {
            if (stored.status === "completed" || stored.status === "failed") return false;
            stored.sandboxProgress = snapshot;
            stored.sandboxHeartbeatAt = new Date().toISOString();
          });
        })
        .catch(() => undefined);
    };

    const consumeLine = (line: string) => {
      if (!line.trim()) return;
      let progressChanged = false;
      try {
        const event = JSON.parse(line) as Record<string, unknown>;
        const eventName = typeof event.event === "string" ? event.event : "";
        const fields =
          event.fields && typeof event.fields === "object"
            ? (event.fields as Record<string, unknown>)
            : event;
        if (["run_summary", "run_failed", "callback_failed"].includes(eventName)) {
          const selectedFields: Record<string, unknown> = {};
          for (const key of [
            "mode",
            "changedFiles",
            "findings",
            "failures",
            "durationMs",
            "phases",
            "rules",
            "checked",
            "modelCalls",
            "toolCalls",
            "attempt",
            "error",
          ]) {
            if (fields[key] !== undefined) selectedFields[key] = fields[key];
          }
          writeOperationalLog("containers.log", {
            reviewId: review.id,
            event: eventName,
            ...selectedFields,
          });
        }
        progressChanged = progress.consume(eventName, fields);
      } catch {
        // Podman- und Git-Ausgaben sind für den Fortschritt nicht relevant.
      }
      if (progressChanged) persist();
    };

    const capture = (stream: "stdout" | "stderr", chunk: Buffer) => {
      const text = chunk.toString();
      pendingLines[stream] += text;
      const lines = pendingLines[stream].split("\n");
      pendingLines[stream] = lines.pop() ?? "";
      for (const line of lines) consumeLine(line);
    };
    child.stdout.on("data", (chunk: Buffer) => capture("stdout", chunk));
    child.stderr.on("data", (chunk: Buffer) => {
      stderrTail = `${stderrTail}${chunk.toString()}`.slice(-8192);
      capture("stderr", chunk);
    });

    const initialProgress = { ...progress.snapshot };
    persistChain = updateReview(review.id, (stored) => {
      if (stored.status === "completed" || stored.status === "failed") return false;
      stored.sandboxStartedAt = startedAt;
      stored.sandboxContainerName = containerName;
      stored.sandboxRuntime = env.sandboxRuntime;
      stored.sandboxProcessId = child.pid;
      stored.sandboxProgress = initialProgress;
      stored.sandboxHeartbeatAt = startedAt;
    }).then(() => undefined).catch(() => undefined);
    writeOperationalLog("application.log", {
      event: "sandbox_started",
      reviewId: review.id,
      runtime: env.sandboxRuntime,
    });
    const heartbeat = setInterval(() => persist(), 15_000);
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
      clearInterval(heartbeat);
      progress.set("error", progress.snapshot.percent, `Podman konnte nicht gestartet werden: ${error.message}`);
      writeOperationalLog("application.log", {
        event: "sandbox_start_failed",
        reviewId: review.id,
        error: error.message,
      });
      persist();
      void persistChain.then(() =>
        resolve({
          exitCode: null,
          timedOut,
          runtimeError: safeRuntimeError(error.message),
        }),
      );
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      clearInterval(heartbeat);
      for (const line of Object.values(pendingLines)) if (line) consumeLine(line);
      progress.set(
        timedOut ? "timeout" : code === 0 ? "exited" : "error",
        code === 0 && !timedOut ? 99 : progress.snapshot.percent,
        timedOut
        ? "Die Prüfung hat länger als erwartet gedauert und wurde beendet."
        : code === 0
          ? "Ergebnisse werden fertiggestellt …"
          : "Die Prüfung wurde unerwartet beendet.",
      );
      writeOperationalLog("application.log", {
        event: timedOut ? "sandbox_timeout" : code === 0 ? "sandbox_finished" : "sandbox_failed",
        reviewId: review.id,
        exitCode: code,
        ...(code !== 0 && stderrTail ? { stderr: stderrTail.trim() } : {}),
      });
      persist();
      void persistChain.then(() =>
        resolve({
          exitCode: code,
          timedOut,
          ...(stderrTail.trim()
            ? { runtimeError: safeRuntimeError(stderrTail) }
            : {}),
        }),
      );
    });
  });
}
