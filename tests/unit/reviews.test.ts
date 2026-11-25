import assert from "node:assert/strict";
import { test } from "node:test";
import { reviewModePresentation, summarizeReview } from "../../src/lib/reviews/summary";
import type { Review } from "../../src/lib/types";

function review(learningExplanation: boolean): Review {
  return {
    id: "review-id",
    status: "queued",
    createdAt: "2026-11-18T00:00:00.000Z",
    updatedAt: "2026-11-18T00:00:00.000Z",
    mr: {
      projectId: 1,
      projectPath: "group/project",
      repoUrl: "https://git.example/group/project.git",
      mrIid: 12,
      title: "Example MR",
      sourceBranch: "feature/example",
      targetBranch: "main",
      sha: "abc123",
      webUrl: "https://git.example/group/project/-/merge_requests/12",
    },
    learningExplanation,
    callbackToken: "secret",
    feedback: [],
  };
}

test("Reviewübersicht markiert ausgewählte Lern-Erklärungen ohne Benutzernamen offenzulegen", () => {
  const selected = summarizeReview(review(true));
  const standard = summarizeReview(review(false));

  assert.equal(selected.learningExplanation, true);
  assert.equal(standard.learningExplanation, false);
  assert.equal("learningUsers" in selected, false);
  assert.deepEqual(reviewModePresentation({ mode: "architecture", learningExplanation: true }), {
    label: "ADR-Check",
    detail: "+ Lern-Erklärung",
    ariaLabel: "ADR-Check mit Lern-Erklärung",
  });
  assert.deepEqual(reviewModePresentation({ mode: "architecture", learningExplanation: false }), {
    label: "ADR-Check",
    ariaLabel: "ADR-Check",
  });
  assert.deepEqual(reviewModePresentation({ mode: "learning", learningExplanation: true }), {
    label: "Lernmodus",
    ariaLabel: "Lernmodus",
  });
  assert.deepEqual(reviewModePresentation({ mode: undefined, learningExplanation: true }), {
    label: "Modus folgt",
    detail: "Lern-Erklärung aktiviert",
    ariaLabel: "Modus folgt, Lern-Erklärung aktiviert",
  });
});
