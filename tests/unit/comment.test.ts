import assert from "node:assert/strict";
import { test } from "node:test";
import { groupForComments, renderComment, renderSummary } from "../../src/lib/gitlab/comment";
import { publishFindings } from "../../src/lib/gitlab/publish";
import { makeReview } from "../fixtures";

test("ADR-Abschlusskommentar nennt nur die Anzahl der Verstöße", () => {
  const review = makeReview();
  review.result!.mode = "architecture";
  const finding = review.result!.findings[0];
  finding.rule = { ...finding.rule, origin: "project", adrFile: "001-architektur.md", adrTitle: "Architektur" };
  review.result!.findings.push(
    { ...finding, id: "finding-2", verdict: "C" },
    { ...finding, id: "finding-3", verdict: "CIA" },
  );

  assert.equal(renderSummary(review), "Es wurde 1 Verstoß gefunden.");

  review.result!.findings.push({ ...finding, id: "finding-4" });
  assert.equal(renderSummary(review), "Es wurden 2 Verstöße gefunden.");

  review.result!.findings = review.result!.findings.filter((item) => item.verdict !== "NC");
  assert.equal(renderSummary(review), null);
});

test("ein Review ohne Verstöße veröffentlicht keinen GitLab-Kommentar", async () => {
  const review = makeReview();
  review.result!.mode = "architecture";
  review.result!.findings = [
    { ...review.result!.findings[0], verdict: "C" },
    { ...review.result!.findings[0], id: "finding-2", verdict: "CIA" },
  ];

  assert.deepEqual(await publishFindings(review), { published: [], reported: 0 });

  review.result!.findings = [];
  assert.deepEqual(await publishFindings(review), { published: [], reported: 0 });
});

test("ADR-Befundkommentar enthält keinen Berichtslink", () => {
  const review = makeReview();
  const finding = review.result!.findings[0];
  finding.rule = { ...finding.rule, origin: "project", adrFile: "001-architektur.md", adrTitle: "Architektur" };

  const comment = renderComment([finding]);
  assert.match(comment, /Architekturkonformität: 1 Befund/);
  assert.match(comment, /Die Eingabe kann leer sein\./);
  assert.doesNotMatch(comment, /Vollständigen Bericht öffnen|\/reviews\//);
});

test("Architekturbefunde bekommen getrennte Positionen und konkrete Verbesserungen", () => {
  const finding = makeReview().result!.findings[0];
  finding.rule = { ...finding.rule, origin: "project", adrFile: "001-architektur.md" };
  finding.consequence = "Aufrufer bekommen einen falschen Wert.";
  finding.suggestion = "Den Rückgabewert an die Schnittstelle anpassen.";
  finding.rule.adrSource = { startLine: 10, endLine: 10, quote: "Nur diese Schnittstelle verwenden." };
  assert.equal(groupForComments([finding, { ...finding, id: "another" }]).size, 2);
  assert.match(renderComment([finding]), /Mögliche Folge:.*falschen Wert/);
  assert.match(renderComment([finding]), /Verbesserung:.*Schnittstelle anpassen/);
  assert.match(renderComment([finding]), /001-architektur\.md:10-10.*Nur diese Schnittstelle verwenden/);
});

test("ADR-Kommentar verlinkt Code-Belege im geprüften Commit und gelöschte Zeilen im Basisstand", () => {
  const review = makeReview();
  review.mr.sha = "new-commit";
  review.mr.diffRefs = { base_sha: "base-commit", head_sha: "new-commit", start_sha: "base-commit" };
  const finding = review.result!.findings[0];
  finding.rule = { ...finding.rule, origin: "project", adrFile: "001-architektur.md" };
  finding.evidence = [
    { path: "src/api client.ts", startLine: 8, endLine: 10, why: "Aufruf ohne Prüfung" },
    { path: "src/alter code.ts", startLine: 4, endLine: 4, revision: "base", why: "Entfernte Prüfung" },
  ];

  const comment = renderComment([finding], review.mr);
  assert.match(comment, /src\/api client\.ts:8-10.*Aufruf ohne Prüfung/);
  assert.match(comment, /https?:\/\/127\.0\.0\.1:1\/test\/project\/-\/blob\/new-commit\/src\/api%20client\.ts#L8/);
  assert.match(comment, /https?:\/\/127\.0\.0\.1:1\/test\/project\/-\/blob\/base-commit\/src\/alter%20code\.ts#L4/);
  assert.match(comment, /src\/alter code\.ts:4.*vor der Änderung.*Entfernte Prüfung/);
});

test("Lernkommentar nennt Code-Stellen auch ohne Inline-Position und ohne Basis-Commit", () => {
  const review = makeReview();
  const finding = review.result!.findings[0];
  finding.anchor = { path: "src/anker.ts", line: 12 };
  finding.evidence = [{ path: "src/alt.ts", startLine: 3, endLine: 3, revision: "base", why: "Vorherige Implementierung" }];

  const comment = renderComment([finding], review.mr);
  assert.match(comment, /src\/anker\.ts:12/);
  assert.match(comment, /\/blob\/abc123\/src\/anker\.ts#L12/);
  assert.match(comment, /src\/alt\.ts:3.*vor der Änderung.*Vorherige Implementierung/);
  assert.doesNotMatch(comment, /\/blob\/abc123\/src\/alt\.ts/);
});

test("lernfreundliche ADR-Erklärungen erscheinen vollständig im bestehenden Kommentar", () => {
  const finding = makeReview().result!.findings[0];
  finding.rule = { ...finding.rule, origin: "project", adrFile: "001-architektur.md", adrTitle: "Schnittstellen" };
  finding.rationale = "ADR-Entscheidung und Konflikt. ".repeat(60);
  finding.consequence = "Konkrete mögliche Folge. ".repeat(60);
  finding.suggestion = "ADR-konforme Verbesserung. ".repeat(60);
  const comment = renderComment([finding]);
  assert.match(comment, /Architekturkonformität.*\[Projekt\] 001-architektur.md/);
  assert.match(comment, /Betroffene Architekturentscheidung: \*\*Schnittstellen\*\*/);
  for (const field of ["rationale", "consequence", "suggestion"] as const) {
    assert.ok(finding[field]!.length > 1200);
    assert.ok(comment.includes(finding[field]!.trim()));
  }
});
