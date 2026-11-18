import assert from "node:assert/strict";
import { test } from "node:test";
import { env } from "../../src/lib/env";

test("LEARNING_USERS wählt ausschließlich normalisierte, exakt passende GitLab-Usernames", () => {
  const previous = process.env.LEARNING_USERS;
  try {
    for (const [list, username, expected] of [
      [undefined, "anna", false],
      ["", "anna", false],
      ["   ", "anna", false],
      [", , ,", "anna", false],
      ["anna,mustermann.max,neue-kollegin", "anna", true],
      ["anna,mustermann.max,neue-kollegin", "mustermann.max", true],
      ["anna,mustermann.max,neue-kollegin", "neue-kollegin", true],
      ["  ANNA , Mustermann.MAX , neue-kollegin ", " mustermann.max ", true],
      ["anna", " ANNA ", true],
      [", anna, ,anna,,", "anna", true],
      [", anna, ,", "", false],
      [", anna, ,", "  ", false],
      ["anna", undefined, false],
      ["anna,mustermann.max", "bob", false],
      ["anna", "anna-extra", false],
      ["anna", "anna@example.test", false],
    ] as const) {
      if (list === undefined) delete process.env.LEARNING_USERS;
      else process.env.LEARNING_USERS = list;
      assert.equal(env.isLearningUser(username), expected, JSON.stringify({ list, username }));
    }
  } finally {
    if (previous === undefined) delete process.env.LEARNING_USERS;
    else process.env.LEARNING_USERS = previous;
  }
});
