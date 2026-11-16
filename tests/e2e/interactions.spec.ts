import { expect, test } from "@playwright/test";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { makeReview } from "../fixtures";

test.beforeEach(async ({ page }) => {
  await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
});

test("Dark Mode wirkt sofort, bleibt beim Navigieren erhalten und wird serverseitig gespeichert", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/settings");
  const toggle = page.getByRole("switch", { name: "Dunkelmodus" });
  await expect(toggle).not.toBeChecked();
  const background = await page.locator("body").evaluate((body) => getComputedStyle(body).backgroundColor);
  const timeOrigin = await page.evaluate(() => performance.timeOrigin);
  const saved = page.waitForResponse((response) => response.url().endsWith("/api/theme") && response.ok());
  await toggle.click();
  await expect(toggle).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.locator("body").evaluate((body) => getComputedStyle(body).backgroundColor)).not.toBe(background);
  await saved;
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Einstellungen", exact: true }).click();
  await expect(toggle).toBeChecked();
  await page.reload();
  await expect(toggle).toBeChecked();
  expect((await context.cookies()).find((cookie) => cookie.name === "adr-review-theme")?.value).toBe("dark");
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(toggle).not.toBeChecked();
  expect(errors).toEqual([]);
});

test("schnelle Theme-Wechsel warten nicht auf das Speichern und die letzte Auswahl gewinnt", async ({ page, context }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let requests = 0;
  let responses = 0;
  page.on("response", (response) => {
    if (response.url().endsWith("/api/theme") && response.ok()) responses += 1;
  });
  await page.route("**/api/theme", async (route) => {
    requests += 1;
    if (requests === 1) await gate;
    await route.continue();
  });
  await page.goto("/settings");
  const toggle = page.getByRole("switch", { name: "Dunkelmodus" });
  for (let index = 0; index < 3; index += 1) await toggle.click();
  await expect(toggle).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  release();
  await expect.poll(() => requests).toBe(3);
  await expect.poll(() => responses).toBe(3);
  await expect.poll(async () => (await context.cookies()).find((cookie) => cookie.name === "adr-review-theme")?.value).toBe("dark");
  await page.reload();
  await expect(toggle).toBeChecked();
});

test("fehlgeschlagenes Theme-Speichern lässt die Auswahl aktiv und zeigt einen Fehler", async ({ page }) => {
  await page.route("**/api/theme", (route) => route.fulfill({ status: 500 }));
  await page.goto("/settings");
  await page.getByRole("switch", { name: "Dunkelmodus" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("alert").filter({ hasText: "nicht dauerhaft gespeichert" })).toBeVisible();
});

test("Suchfilter können ohne Navigation zurückgesetzt und über die URL wiederhergestellt werden", async ({ page }) => {
  await page.goto("/");
  const input = page.getByRole("textbox", { name: "Merge Requests durchsuchen" });
  await input.fill("kein-treffer-12345");
  await page.getByRole("button", { name: "Filter zurücksetzen" }).click();
  await expect(input).toHaveValue("");
  await input.fill("gespeicherte-suche");
  await input.press("Enter");
  await expect(page).toHaveURL(/q=gespeicherte-suche/);
  await page.reload();
  await expect(input).toHaveValue("gespeicherte-suche");
});

test("Feedback speichert ohne Seitenwechsel und rollt bei Fehlern zurück", async ({ page }) => {
  const directory = join(process.env.E2E_DATA_DIR!, "reviews");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "feedback-e2e.json"), JSON.stringify(makeReview("feedback-e2e")));
  await page.goto("/reviews/feedback-e2e");
  const up = page.getByRole("button", { name: "Bemerkung hilfreich", exact: true });
  const down = page.getByRole("button", { name: "Bemerkung nicht hilfreich", exact: true });
  await up.click();
  await expect(up).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Gespeichert", { exact: true })).toBeVisible();
  await expect(page).toHaveURL("/reviews/feedback-e2e");
  await page.reload();
  await expect(up).toHaveAttribute("aria-pressed", "true");
  await page.route("**/api/findings/*/feedback", (route) => route.fulfill({ status: 500 }));
  await down.click();
  await expect(page.getByRole("alert").filter({ hasText: "Feedback konnte nicht gespeichert" })).toBeVisible();
  await expect(up).toHaveAttribute("aria-pressed", "true");
  await expect(down).toHaveAttribute("aria-pressed", "false");
});

test("APIs lehnen ungültige Eingaben ab und GET verändert kein Feedback", async ({ request }) => {
  for (const body of [null, [], { reviewId: 1, rating: "up" }, { reviewId: "test", rating: "up", comment: {} }]) {
    const response = await request.post("/api/findings/finding-1/feedback", {
      data: JSON.stringify(body), headers: { "Content-Type": "application/json" },
    });
    expect(response.status()).toBe(400);
  }
  expect((await request.get("/api/findings/finding-1/feedback?review=test&rating=up")).status()).toBe(405);
  expect((await request.post("/api/theme", { data: { theme: "invalid" } })).status()).toBe(400);
  const redirect = await request.post("/api/theme", { form: { theme: "dark", returnTo: "/\\example.org" }, maxRedirects: 0 });
  expect(redirect.status()).toBe(303);
  // Next normalisiert die interne Request-Origin im Entwicklungsserver.
  const location = new URL(redirect.headers().location);
  expect(["127.0.0.1", "localhost"]).toContain(location.hostname);
  expect(location.pathname).toBe("/settings");
  expect(location.port).toBe("3147");
});

test("laufende Reviews erhalten Live-Fortschritt und aktualisieren den Bericht beim Abschluss", async ({ page, request }) => {
  const review = makeReview("progress-e2e");
  review.status = "running";
  review.result = undefined;
  const directory = join(process.env.E2E_DATA_DIR!, "reviews");
  await mkdir(directory, { recursive: true });
  const file = join(directory, `${review.id}.json`);
  await writeFile(file, JSON.stringify(review));
  const jsonResponse = await request.get(`/api/reviews/${review.id}/progress`);
  expect(await jsonResponse.json()).toEqual({ status: "running" });
  expect(jsonResponse.headers()["cache-control"]).toContain("no-store");
  let jsonPolls = 0;
  page.on("request", (request) => {
    if (request.url().endsWith(`/api/reviews/${review.id}/progress`) &&
      !request.headers().accept?.includes("text/event-stream")) jsonPolls += 1;
  });
  const connected = page.waitForResponse((response) => response.url().endsWith(`/api/reviews/${review.id}/progress`) &&
    response.headers()["content-type"]?.includes("text/event-stream"));
  await page.goto(`/reviews/${review.id}`);
  await connected;
  await expect(page.getByRole("progressbar")).toBeVisible();
  const timeOrigin = await page.evaluate(() => performance.timeOrigin);
  for (const percent of [53, 66, 79]) {
    review.sandboxProgress = { phase: "judging", percent, message: `Regeln: ${(percent - 40) / 13} von 4 bearbeitet …`, updatedAt: new Date().toISOString() };
    await writeFile(`${file}.tmp`, JSON.stringify(review));
    const started = Date.now();
    await rename(`${file}.tmp`, file);
    await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", String(percent), { timeout: 1500 });
    expect(Date.now() - started).toBeLessThan(1500);
  }
  expect(jsonPolls).toBe(0);
  await writeFile(`${file}.tmp`, JSON.stringify(makeReview(review.id)));
  await rename(`${file}.tmp`, file);
  await expect(page.getByText("Review abgeschlossen", { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Bemerkung hilfreich", exact: true })).toBeVisible();
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);
});

test("bei unterbrochenem Live-Kanal übernimmt die JSON-Abfrage bis zum Fehlerstatus", async ({ page }) => {
  const review = makeReview("progress-fallback-e2e");
  review.status = "running";
  review.result = undefined;
  const directory = join(process.env.E2E_DATA_DIR!, "reviews");
  await mkdir(directory, { recursive: true });
  const file = join(directory, `${review.id}.json`);
  await writeFile(file, JSON.stringify(review));
  await page.route(`**/api/reviews/${review.id}/progress`, (route) =>
    route.request().headers().accept?.includes("text/event-stream")
      ? route.abort() : route.continue());
  const fallback = page.waitForResponse((response) => response.url().endsWith(`/api/reviews/${review.id}/progress`) && response.ok());
  await page.goto(`/reviews/${review.id}`);
  await fallback;
  review.status = "failed";
  review.error = "Testfehler";
  await writeFile(`${file}.tmp`, JSON.stringify(review));
  await rename(`${file}.tmp`, file);
  await expect(page.getByText("Review konnte nicht abgeschlossen werden", { exact: true })).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveCount(0);
});

test("Review-Liste überträgt keine Callback-Tokens oder vollständigen Analyseergebnisse", async ({ request }) => {
  const directory = join(process.env.E2E_DATA_DIR!, "reviews");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "summary-e2e.json"), JSON.stringify(makeReview("summary-e2e")));
  const response = await request.get("/");
  expect(response.ok()).toBe(true);
  const html = await response.text();
  expect(html).toContain("Regression review");
  expect(html).not.toContain("private-callback-token");
  expect(html).not.toContain("Die Eingabe kann leer sein.");
});
