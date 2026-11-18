import assert from "node:assert/strict";
import { test } from "node:test";
import { env } from "../../src/lib/env";
import { automatedReviewReason } from "../../src/lib/review-trigger";

test("Automationsfilter erkennt Bot-Autoren und reservierte Branch-Präfixe ohne Teilworttreffer", () => {
  const filter = env.reviewTriggerFilter;
  assert.equal(automatedReviewReason("renovate/react-19.x", { username: "alice" }, filter), "source branch");
  assert.equal(automatedReviewReason("dependabot/npm/react", undefined, filter), "source branch");
  assert.equal(automatedReviewReason("chore/deps", { username: "Renovate" }, filter), "excluded author");
  assert.equal(automatedReviewReason("chore/deps", { username: "project_17_bot_abcd", bot: true }, filter), "bot author");
  for (const sourceBranch of ["feature/new-api", "fix/renovate-config", "renovate-docs"]) {
    assert.equal(automatedReviewReason(sourceBranch, { username: "alice", bot: false }, filter), null);
  }
  assert.equal(automatedReviewReason("feature", { username: "alice-renovate", bot: false }, filter), null);
});

test("konfigurierte Ausschlüsse ergänzen Defaults, vergleichen Accounts exakt und Präfixe case-sensitiv", () => {
  const previousAuthors = process.env.GITLAB_IGNORED_MR_AUTHORS;
  const previousPrefixes = process.env.GITLAB_IGNORED_SOURCE_BRANCH_PREFIXES;
  try {
    process.env.GITLAB_IGNORED_MR_AUTHORS = " SVC-Dependencies, ,company-renovate ";
    process.env.GITLAB_IGNORED_SOURCE_BRANCH_PREFIXES = " automation/, ,DependencyUpdates/ ";
    const filter = env.reviewTriggerFilter;
    assert.equal(automatedReviewReason("feature", { username: "svc-dependencies", bot: false }, filter), "excluded author");
    assert.equal(automatedReviewReason("feature", { username: "svc-dependencies-human" }, filter), null);
    assert.equal(automatedReviewReason("automation/release", undefined, filter), "source branch");
    assert.equal(automatedReviewReason("dependencyupdates/release", undefined, filter), null);
    assert.equal(automatedReviewReason("DependencyUpdates/release", undefined, filter), "source branch");
    assert.equal(automatedReviewReason("renovate/react", undefined, filter), "source branch");
    assert.equal(automatedReviewReason("feature", { username: "dependabot" }, filter), "excluded author");
  } finally {
    if (previousAuthors === undefined) delete process.env.GITLAB_IGNORED_MR_AUTHORS;
    else process.env.GITLAB_IGNORED_MR_AUTHORS = previousAuthors;
    if (previousPrefixes === undefined) delete process.env.GITLAB_IGNORED_SOURCE_BRANCH_PREFIXES;
    else process.env.GITLAB_IGNORED_SOURCE_BRANCH_PREFIXES = previousPrefixes;
  }
});
