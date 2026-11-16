import type { Review } from "../src/lib/types";

export function makeReview(id = "test-review"): Review {
  return {
    id,
    status: "completed",
    createdAt: "2026-11-01T12:00:00.000Z",
    updatedAt: "2026-11-01T12:00:00.000Z",
    callbackToken: "private-callback-token",
    feedback: [],
    mr: {
      projectId: 1,
      projectPath: "test/project",
      repoUrl: "http://127.0.0.1:1/test/project.git",
      mrIid: 1,
      title: "Regression review",
      sourceBranch: "feature",
      targetBranch: "main",
      sha: "abc123",
      webUrl: "http://127.0.0.1:1/test/project/-/merge_requests/1",
    },
    result: {
      reviewId: id,
      mode: "learning",
      ruleOrigin: "learning",
      adrFiles: [],
      changedFiles: ["src/example.ts"],
      rules: [],
      droppedRules: [],
      failures: [],
      findings: [{
        id: "finding-1",
        rule: { id: "rule-1", text: "Eingabe prüfen", adrTitle: "Lernhinweis", adrFile: "", origin: "learning" },
        verdict: "NC",
        rationale: "Die Eingabe kann leer sein.",
        evidence: [],
        trace: [],
        budgetExhausted: false,
        modelCalls: 1,
      }],
      stats: {
        startedAt: "2026-11-01T12:00:00.000Z",
        finishedAt: "2026-11-01T12:00:01.000Z",
        durationMs: 1000,
        modelCalls: 1,
        toolCalls: 0,
      },
    },
  };
}
