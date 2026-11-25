import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import { join } from "node:path";
import { getReviewAfterPendingWrites, watchReview } from "../../src/lib/reviews/store";
import { POST } from "../../src/app/api/gitlab/webhook/route";
import { pruneOperationalLogs } from "../../src/lib/operational-log";

let directory: string;
let repoUrl: string;
let handler: (path: string, response: ServerResponse) => void;
const calls: string[] = [];
const previousEnvironment = { ...process.env };
const environmentKeys = ["DATA_DIR", "GITLAB_WEBHOOK_SECRET", "GITLAB_IGNORED_MR_AUTHORS",
  "GITLAB_IGNORED_SOURCE_BRANCH_PREFIXES", "GITLAB_CONNECTIONS", "LEARNING_USERS",
  "SANDBOX_RUNTIME", "LLM_BASE_URL", "LLM_CHAT_PATH", "LLM_API_KEY", "ADR_LEARNING_EXPLANATION"];
const previousDirectory = process.cwd();
const server = createServer((request, response) => {
  const path = request.url!;
  calls.push(`${request.method} ${path}`);
  response.setHeader("Content-Type", "application/json");
  handler(path, response);
});

before(async () => {
  directory = await mkdtemp("/tmp/opencode/webhook-test-");
  process.chdir(directory);
  process.env.DATA_DIR = join(directory, "data");
  process.env.GITLAB_WEBHOOK_SECRET = "webhook-test-secret";
  process.env.GITLAB_IGNORED_MR_AUTHORS = "svc-dependencies";
  process.env.GITLAB_IGNORED_SOURCE_BRANCH_PREFIXES = "automation/";
  process.env.LEARNING_USERS = "alice,renovate,svc-dependencies";
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const host = `http://127.0.0.1:${address.port}`;
  repoUrl = `${host}/test/project.git`;
  process.env.GITLAB_CONNECTIONS = JSON.stringify([{ host, token: "test-token" }]);
});

after(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  // Wartet auch auf ausstehende Log-Schreibvorgänge vor dem Löschen der Testdaten.
  await pruneOperationalLogs(join(directory, "logs"));
  process.chdir(previousDirectory);
  for (const key of environmentKeys) {
    if (previousEnvironment[key] === undefined) delete process.env[key];
    else process.env[key] = previousEnvironment[key];
  }
  await rm(directory, { recursive: true, force: true });
});

test("Webhook reicht nur den Lernstatus des geladenen MR-Autors über Orchestrator und Sandbox-Start weiter", { timeout: 20_000 }, async (t) => {
  const previous = { ...process.env };
  t.after(() => {
    for (const key of environmentKeys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });
  const runtime = join(directory, "sandbox-runtime.cjs");
  const captured = join(directory, "sandbox-environment.json");
  await writeFile(runtime, `#!${process.execPath}
const args = process.argv.slice(2);
require("node:fs").writeFileSync(${JSON.stringify(captured)}, JSON.stringify({
  flag: process.env.ADR_LEARNING_EXPLANATION,
  chatPath: process.env.LLM_CHAT_PATH,
  list: process.env.LEARNING_USERS ?? null,
  keys: args.filter((arg, index) => args[index - 1] === "--env"),
  args
}));
`, { mode: 0o700 });
  process.env.SANDBOX_RUNTIME = runtime;
  process.env.LLM_BASE_URL = "http://example.test/v1";
  process.env.LLM_CHAT_PATH = "/chat/completions";
  process.env.LLM_API_KEY = "test-key";
  // Eine geerbte Auswahl darf die backendseitige Entscheidung nicht überstimmen.
  process.env.ADR_LEARNING_EXPLANATION = "1";

  for (const [list, username, eventUsername, expected] of [
    [undefined, "anna", "anna", false],
    ["", "anna", "anna", false],
    [" , ANNA, , ", "anna", "bob", true],
    ["anna", "bob", "anna", false],
    ["anna", "bob", "bob", false],
  ] as const) {
    if (list === undefined) delete process.env.LEARNING_USERS;
    else process.env.LEARNING_USERS = list;
    const payload = { ...event(), learningExplanation: true, user: { id: 99, username: eventUsername, bot: false } };
    calls.length = 0;
    let releaseNote!: () => void;
    const noteRequested = new Promise<void>((resolve) => {
      handler = (path, response) => {
        if (path === "/api/v4/users/42") response.end(JSON.stringify({ id: 42, username, bot: false,
          name: "anna", email: "anna" }));
        else if (path === "/api/v4/projects/17") response.end(JSON.stringify({ path_with_namespace: "test/project", http_url_to_repo: repoUrl }));
        else if (path === "/api/v4/projects/17/merge_requests/3") response.end(JSON.stringify({ title: "Test",
          source_branch: "feature/example", target_branch: "main", sha: "abc", web_url: `${repoUrl}/mr/3` }));
        else if (path.endsWith("/notes")) {
          releaseNote = () => response.end(JSON.stringify({ id: 123 }));
          resolve();
        } else if (path.endsWith("/notes/123")) { response.writeHead(204); response.end(); }
        else { response.writeHead(400); response.end("unexpected API call"); }
      };
    });
    const response = await POST(request(payload));
    assert.equal(response.status, 202);
    const { reviewId } = await response.json();
    const review = await getReviewAfterPendingWrites(reviewId);
    assert.equal(review?.learningExplanation, expected);
    assert.equal(Object.hasOwn(review!, "learningUsers"), false);
    await noteRequested;
    await new Promise<void>((resolve, reject) => {
      const stop = watchReview(reviewId, () => {
        void getReviewAfterPendingWrites(reviewId).then((stored) => {
          // Der Runtime-Ersatz beendet den Lauf ohne Callback. Warte auch auf
          // das Entfernen der Notiz, damit der Hintergrundlauf abgeschlossen ist.
          if (stored?.status === "failed" && stored.placeholderNoteId === undefined) { stop(); resolve(); }
        }, reject);
      }, reject);
      releaseNote();
    });
    const launch = JSON.parse(await readFile(captured, "utf8"));
    assert.equal(launch.flag, expected ? "1" : "0");
    assert.equal(launch.chatPath, "/chat/completions");
    assert.ok(launch.keys.includes("LLM_CHAT_PATH"));
    assert.equal(launch.list, null, "auch der Runtime-Prozess bekommt keine Benutzernamenliste");
    assert.ok(launch.keys.includes("ADR_LEARNING_EXPLANATION"));
    assert.ok(!launch.keys.includes("LEARNING_USERS"));
    assert.ok(!launch.args.some((arg: string) => arg.includes("ANNA") || arg.includes("anna")));
    assert.equal(process.env.LEARNING_USERS, list, "Backend-Konfiguration bleibt erhalten");
    assert.ok(calls.includes("GET /api/v4/users/42"));
    assert.ok(!calls.includes("GET /api/v4/users/99"));
  }
});

function event() {
  return {
    object_kind: "merge_request",
    project: { id: 17, git_http_url: repoUrl },
    user: { id: 42, username: "alice", bot: false },
    object_attributes: { iid: 3, action: "open", state: "opened", author_id: 42, source_branch: "feature/example", draft: false },
  };
}

function request(payload: unknown, secret = "webhook-test-secret") {
  return new Request("http://localhost/api/gitlab/webhook", {
    method: "POST", headers: { "x-gitlab-token": secret, "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
}

async function storedReviews() {
  return readdir(join(directory, "data/reviews")).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
}

test("Renovate, Dependabot und eigene Automatisierung starten weder Review noch GitLab-Abfragen", async () => {
  const before = await storedReviews();
  for (const scenario of ["renovate-branch", "dependabot-branch", "custom-branch", "renovate-author", "custom-author", "bot"] as const) {
    calls.length = 0;
    handler = (_path, response) => { response.writeHead(400); response.end("unexpected API call"); };
    const payload = event();
    if (scenario === "renovate-branch") payload.object_attributes.source_branch = "renovate/react-19.x";
    if (scenario === "dependabot-branch") payload.object_attributes.source_branch = "dependabot/npm/react";
    if (scenario === "custom-branch") payload.object_attributes.source_branch = "automation/release";
    if (scenario === "renovate-author") payload.user.username = "Renovate";
    if (scenario === "custom-author") payload.user.username = "svc-dependencies";
    if (scenario === "bot") payload.user.bot = true;
    const response = await POST(request(payload));
    assert.equal(response.status, 200, scenario);
    assert.equal((await response.json()).status, "ignored", scenario);
    assert.deepEqual(calls, [], scenario);
    assert.deepEqual(await storedReviews(), before, scenario);
  }
});

test("Bot-Auskunft und eigener Account werden vom MR-Autor geladen, auch bei menschlichem Ereignisbenutzer", async () => {
  const before = await storedReviews();
  for (const bot of [true, false]) {
    calls.length = 0;
    const payload = event();
    payload.object_attributes.author_id = 99;
    handler = (_path, response) => response.end(JSON.stringify({ id: 99, username: "svc-dependencies", bot }));
    const response = await POST(request(payload));
    assert.deepEqual(await response.json(), { status: "ignored", reason: bot ? "bot author" : "excluded author" });
    assert.deepEqual(calls, ["GET /api/v4/users/99"]);
    assert.deepEqual(await storedReviews(), before);
  }
});

test("Autorenabfrage darf bei Fehlern oder fehlendem Bot-Kennzeichen keinen Review starten", async () => {
  const before = await storedReviews();
  for (const scenario of ["http-error", "missing-bot", "wrong-user"] as const) {
    calls.length = 0;
    handler = (_path, response) => {
      if (scenario === "http-error") response.writeHead(403);
      response.end(JSON.stringify({ id: scenario === "wrong-user" ? 99 : 42, username: "alice",
        ...(scenario === "missing-bot" ? {} : { bot: false }) }));
    };
    assert.equal((await POST(request(event()))).status, 503, scenario);
    assert.deepEqual(calls, ["GET /api/v4/users/42"]);
    assert.deepEqual(await storedReviews(), before);
  }
});

test("Secret, Ereignistyp, Entwurf und andere MR-Aktionen werden weiterhin vor jeder API-Abfrage gefiltert", async () => {
  calls.length = 0;
  assert.equal((await POST(request(event(), "wrong-secret"))).status, 401);
  assert.equal((await POST(request(null))).status, 400);
  assert.equal((await POST(request({ ...event(), object_kind: "push" }))).status, 200);
  for (const action of ["update", "reopen", "merge", "close"]) {
    const payload = event();
    payload.object_attributes.action = action;
    assert.deepEqual(await (await POST(request(payload))).json(), { status: "ignored", reason: "action" });
  }
  const draft = event();
  draft.object_attributes.draft = true;
  assert.deepEqual(await (await POST(request(draft))).json(), { status: "ignored", reason: "action" });
  const missingAuthor = event();
  Reflect.deleteProperty(missingAuthor.object_attributes, "author_id");
  assert.equal((await POST(request(missingAuthor))).status, 400);
  assert.deepEqual(calls, []);
});

test("menschlicher MR wird trotz Bot-Ereignisbenutzer und Renovate im Thema angenommen", async () => {
  const payload = event();
  payload.user = { id: 99, username: "renovate", bot: true };
  payload.object_attributes.source_branch = "fix/renovate-config";
  calls.length = 0;
  let releaseNote!: () => void;
  const noteRequested = new Promise<void>((resolve) => {
    handler = (path, response) => {
      if (path === "/api/v4/users/42") response.end(JSON.stringify({ id: 42, username: "alice", bot: false }));
      else if (path === "/api/v4/projects/17") response.end(JSON.stringify({ path_with_namespace: "test/project", http_url_to_repo: repoUrl }));
      else if (path === "/api/v4/projects/17/merge_requests/3") response.end(JSON.stringify({ title: "Renovate-Konfiguration korrigieren",
        source_branch: payload.object_attributes.source_branch, target_branch: "main", sha: "abc", web_url: `${repoUrl}/mr/3` }));
      else {
        // Ein kontrollierter Setup-Fehler beendet den Hintergrundlauf ohne Container.
        releaseNote = () => { response.writeHead(400); response.end(JSON.stringify({ message: "test ends before sandbox" })); };
        resolve();
      }
    };
  });
  const response = await POST(request(payload));
  assert.equal(response.status, 202);
  const accepted = await response.json();
  assert.equal(accepted.status, "accepted");
  assert.equal((await getReviewAfterPendingWrites(accepted.reviewId))?.mr.sourceBranch, "fix/renovate-config");
  await noteRequested;
  assert.ok(calls.includes("GET /api/v4/users/42"));
  assert.ok(!calls.includes("GET /api/v4/users/99"));
  assert.ok(calls.includes("POST /api/v4/projects/17/merge_requests/3/notes"));
  await new Promise<void>((resolve, reject) => {
    const stop = watchReview(accepted.reviewId, () => {
      void getReviewAfterPendingWrites(accepted.reviewId).then((review) => {
        if (review?.status === "failed") { stop(); resolve(); }
      }, reject);
    }, reject);
    releaseNote();
  });
});
