import assert from "node:assert/strict";
import { test } from "node:test";
import { renderComment, renderSummary } from "../../src/lib/comment";
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
