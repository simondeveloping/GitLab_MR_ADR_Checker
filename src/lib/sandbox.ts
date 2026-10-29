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
import { updateReview } from "./store";
import type { Review } from "./types";

export interface SandboxOutcome {
  exitCode: number | null;
  timedOut: boolean;
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

    let pendingLine = "";
    let phase = "starting";
    let lastMessage = "Podman startet den Sandbox-Container.";
    let percent = 3;
    let currentRule: number | undefined;
    let totalRules: number | undefined;
    let persistChain = Promise.resolve();

    const persist = () => {
      const snapshot = { phase, lastMessage, currentRule, totalRules, percent };
      persistChain = persistChain
        .then(async () => {
          await updateReview(review.id, (stored) => {
            stored.sandboxProgress = {
              phase: snapshot.phase,
              message: snapshot.lastMessage,
              percent: snapshot.percent,
              currentRule: snapshot.currentRule,
              totalRules: snapshot.totalRules,
              updatedAt: new Date().toISOString(),
            };
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
        switch (eventName) {
          case "run_start":
            progressChanged = true;
            phase = "running";
            percent = 8;
            lastMessage = "Review wird vorbereitet …";
            break;
          case "checkout_done":
            progressChanged = true;
            phase = "checkout";
            percent = 18;
            lastMessage = "Änderungen werden für die Prüfung vorbereitet …";
            break;
          case "rulebase_selected":
            progressChanged = true;
            phase = "rulebase";
            percent = 25;
            lastMessage = "Prüfkriterien werden geladen …";
            break;
          case "extraction_done":
            progressChanged = true;
            phase = "extraction";
            percent = 35;
            lastMessage = "Relevante Prüfkriterien werden ermittelt …";
            break;
          case "triage_done":
            progressChanged = true;
            phase = "triage";
            percent = 40;
            lastMessage = "Die Codeänderungen werden geprüft …";
            break;
          case "rule_start":
            progressChanged = true;
            phase = "judging";
            currentRule =
              typeof fields.index === "number" ? fields.index : undefined;
            totalRules = typeof fields.of === "number" ? fields.of : undefined;
            if (currentRule && totalRules) {
              percent = Math.min(90, 40 + Math.floor((currentRule / totalRules) * 48));
            }
            lastMessage = totalRules
              ? `Code wird geprüft (${currentRule ?? 1} von ${totalRules}) …`
              : "Code wird geprüft …";
            break;
          case "rules_extracted":
            progressChanged = true;
            phase = "extraction";
            lastMessage = "Prüfkriterien werden vorbereitet …";
            break;
          case "rule_judged":
            progressChanged = true;
            if (currentRule && totalRules) {
              percent = Math.min(92, 40 + Math.floor((currentRule / totalRules) * 50));
            }
            lastMessage = "Code-Prüfung läuft …";
            break;
          case "callback_sent":
            progressChanged = true;
            phase = "callback";
            percent = 98;
            lastMessage = "Ergebnisse werden fertiggestellt …";
            break;
          case "run_summary":
            progressChanged = true;
            phase = "finishing";
            percent = 95;
            lastMessage = "Prüfung abgeschlossen; Ergebnisse werden gespeichert …";
            break;
          case "error":
            progressChanged = true;
            phase = "error";
            percent = Math.min(percent, 90);
            lastMessage = "Die Prüfung wird beendet. Ergebnisse werden geprüft …";
            break;
        }
      } catch {
        // Podman- und Git-Ausgaben sind für den Fortschritt nicht relevant.
      }
      if (progressChanged) persist();
    };

    const capture = (chunk: Buffer) => {
      const text = chunk.toString();
      pendingLine += text;
      const lines = pendingLine.split("\n");
      pendingLine = lines.pop() ?? "";
      for (const line of lines) consumeLine(line);
    };
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);

    void updateReview(review.id, (stored) => {
      stored.sandboxStartedAt = startedAt;
      stored.sandboxContainerName = containerName;
      stored.sandboxRuntime = env.sandboxRuntime;
      stored.sandboxProcessId = child.pid;
      stored.sandboxProgress = {
        phase,
        message: lastMessage,
        percent,
        updatedAt: startedAt,
      };
      stored.sandboxHeartbeatAt = startedAt;
    }).catch(() => undefined);
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
      phase = "error";
      lastMessage = `Podman konnte nicht gestartet werden: ${error.message}`;
      percent = 0;
      persist();
      void persistChain.then(() => resolve({ exitCode: null, timedOut }));
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      clearInterval(heartbeat);
      if (pendingLine) consumeLine(pendingLine);
      phase = timedOut ? "timeout" : code === 0 ? "exited" : "error";
      percent = code === 0 && !timedOut ? 100 : Math.min(percent, 90);
      lastMessage = timedOut
        ? "Die Prüfung hat länger als erwartet gedauert und wurde beendet."
        : code === 0
          ? "Review abgeschlossen."
          : "Die Prüfung wurde unerwartet beendet.";
      persist();
      void persistChain.then(() => resolve({ exitCode: code, timedOut }));
    });
  });
}
