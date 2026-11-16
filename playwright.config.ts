import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Eigene Daten und eigener Next-Build für jeden Testlauf.
const dataDir = process.env.E2E_DATA_DIR ?? mkdtempSync(join(tmpdir(), "adr-review-e2e-"));
process.env.E2E_DATA_DIR = dataDir;

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:3147",
    browserName: "chromium",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3147",
    url: "http://127.0.0.1:3147/settings",
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      DATA_DIR: dataDir,
      NEXT_DIST_DIR: ".next-test",
      // Testberichte greifen niemals auf die konfigurierte GitLab-Instanz zu.
      GITLAB_CONNECTIONS: '[{"host":"http://127.0.0.1:1","token":"test-token"}]',
    },
  },
});
