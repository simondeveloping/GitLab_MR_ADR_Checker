import assert from "node:assert/strict";
import { test } from "node:test";
import { groupByAdr, renderComment, renderSummary } from "../../src/lib/comment";
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
  assert.equal(renderSummary(review), "Es wurden keine Verstöße gefunden.");
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
  assert.equal(groupByAdr([finding, { ...finding, id: "another" }]).size, 2);
  assert.match(renderComment([finding]), /Mögliche Folge:.*falschen Wert/);
  assert.match(renderComment([finding]), /Verbesserung:.*Schnittstelle anpassen/);
  assert.match(renderComment([finding]), /001-architektur\.md:10-10.*Nur diese Schnittstelle verwenden/);
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
