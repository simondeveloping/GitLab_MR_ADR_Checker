/**
 * Detailseite eines Reviews (Abschnitt 7.3).
 *
 * Der Merge Request bleibt frei von Rauschen, weil dort nur Verstöße
 * erscheinen. Die Nachvollziehbarkeit bleibt trotzdem erhalten: Diese Seite
 * zeigt alle geprüften Regeln mit Begründung, Belegstelle und den
 * zugehörigen Werkzeugaufrufen, also auch die eingehaltenen und die
 * unentscheidbaren (NFA-3).
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { getReview } from "@/lib/store";
import { ruleSource } from "@/lib/comment";
import { findingsOf, verdictCounts, withVerdict } from "@/lib/findings";
import type {
  AgentFailure,
  FeedbackEntry,
  Finding,
  Verdict,
} from "@/lib/types";
import FeedbackForm from "./FeedbackForm";

export const dynamic = "force-dynamic";

const VERDICT_LABEL: Record<Verdict, string> = {
  C: "eingehalten",
  NC: "verletzt",
  CIA: "nicht entscheidbar",
};

const VERDICT_ORDER: Verdict[] = ["NC", "CIA", "C"];

/**
 * Anzeigenamen der Verarbeitungsstufen. Die Bezeichner im Datensatz bleiben
 * unverändert, damit ältere Läufe weiterhin lesbar sind; hier heißt der
 * Schritt, der nicht einschlägige Regeln aussortiert, "Vorfilter".
 */
const STAGE_LABEL: Record<AgentFailure["stage"], string> = {
  extract: "Extraktion",
  triage: "Vorfilter",
  locator: "Locator",
  reader: "Reader",
};

function FindingCard({
  finding,
  reviewId,
  feedback,
}: {
  finding: Finding;
  reviewId: string;
  /** Bereits abgegebene Rückmeldung zu diesem Befund, falls vorhanden. */
  feedback?: FeedbackEntry;
}) {
  const emptyGreps = finding.trace.filter(
    (t) => t.tool === "grep" && t.resultCount === 0,
  ).length;

  return (
    <div className="card" id={finding.id}>
      <div className="card-row">
        <code>{ruleSource(finding)}</code>
        <span className={`badge badge-${finding.verdict}`}>
          {finding.verdict} · {VERDICT_LABEL[finding.verdict]}
        </span>
      </div>

      <p className="rule-text">{finding.rule.text}</p>
      <p>{finding.rationale}</p>

      {finding.evidence.length > 0 ? (
        <ul className="meta">
          {finding.evidence.map((evidence, index) => (
            <li key={index}>
              <code>
                {evidence.path}:{evidence.startLine}-{evidence.endLine}
              </code>
              {evidence.why ? ` — ${evidence.why}` : null}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="meta">
        {finding.trace.length} Werkzeugaufrufe ({emptyGreps} Leersuchen) ·{" "}
        {finding.modelCalls} Modellaufrufe
        {finding.tokenUsage ? (
          <> · {finding.tokenUsage.totalTokens.toLocaleString("de-DE")} Tokens</>
        ) : null}
      </div>

      {finding.trace.length > 0 ? (
        <details>
          <summary>Werkzeugprotokoll</summary>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Rolle</th>
                <th>Werkzeug</th>
                <th>Argumente</th>
                <th>Treffer</th>
                <th>ms</th>
              </tr>
            </thead>
            <tbody>
              {finding.trace.map((entry) => (
                <tr key={entry.step}>
                  <td>{entry.step}</td>
                  <td>{entry.role}</td>
                  <td>
                    <code>{entry.tool}</code>
                  </td>
                  <td>
                    <code>{JSON.stringify(entry.args)}</code>
                  </td>
                  <td>{entry.resultCount}</td>
                  <td>{entry.durationMs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ) : null}

      {/* Bewertet wird der einzelne, belegte Befund und nicht der Review als
          Ganzes (FA-15, Abschnitt 7.5). */}
      <FeedbackForm
        reviewId={reviewId}
        findingId={finding.id}
        existing={feedback}
      />
    </div>
  );
}

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const review = await getReview(id);
  if (!review) notFound();

  const result = review.result;
  const findings = findingsOf(review);
  const counts = verdictCounts(findings);
  const feedbackByFinding = new Map(
    (review.feedback ?? []).map((entry) => [entry.findingId, entry]),
  );

  return (
    <>
      <p className="meta">
        <Link href="/">← alle Reviews</Link>
      </p>

      <h1>
        {review.mr.projectPath} !{review.mr.mrIid}
      </h1>
      <p className="subtitle">
        {review.mr.title} · <a href={review.mr.webUrl}>Merge Request in GitLab</a>
      </p>

      <div className="stats">
        <div>
          <span className="stat-label">Status</span>
          <span className="stat-value">{review.status}</span>
        </div>
        <div>
          <span className="stat-label">Regelbasis</span>
          <span className="stat-value">
            {result?.ruleOrigin === "group"
              ? "Gruppenstandard"
              : result?.ruleOrigin === "project"
                ? "Projekt-ADRs"
                : "—"}
          </span>
        </div>
        <div>
          <span className="stat-label">Regeln geprüft</span>
          <span className="stat-value">{findings.length}</span>
        </div>
        <div>
          <span className="stat-label">Verstöße</span>
          <span className="stat-value" style={{ color: "var(--nc)" }}>
            {counts.NC}
          </span>
        </div>
        <div>
          <span className="stat-label">Nicht entscheidbar</span>
          <span className="stat-value" style={{ color: "var(--cia)" }}>
            {counts.CIA}
          </span>
        </div>
        <div>
          <span className="stat-label">Laufzeit</span>
          <span className="stat-value">
            {result ? `${Math.round(result.stats.durationMs / 1000)}s` : "—"}
          </span>
        </div>
        <div>
          <span className="stat-label">Modellaufrufe</span>
          <span className="stat-value">{result?.stats.modelCalls ?? "—"}</span>
        </div>
        <div>
          <span className="stat-label">Tokens gesamt</span>
          <span className="stat-value">
            {result?.stats.totalTokens?.toLocaleString("de-DE") ?? "—"}
          </span>
        </div>
        <div>
          <span className="stat-label">Tokens / Regel</span>
          <span className="stat-value">
            {result?.stats.averageTokensPerCheckedRule
              ? Math.round(result.stats.averageTokensPerCheckedRule).toLocaleString("de-DE")
              : "—"}
          </span>
        </div>
      </div>

      {review.error ? (
        <div className="card" style={{ borderColor: "var(--nc)" }}>
          <strong>Der Lauf ist gescheitert.</strong>
          <p>{review.error}</p>
        </div>
      ) : null}

      {result ? (
        <>
          <h2>Regelbasis</h2>
          <p className="meta">
            {result.adrFiles.length} ADR-Datei(en):{" "}
            {result.adrFiles.map((file) => (
              <code key={file} style={{ marginRight: "0.5rem" }}>
                {file}
              </code>
            ))}
          </p>
          <p className="meta">
            {result.rules.length} Regeln extrahiert,{" "}
            {result.droppedRules.length} davon vom Vorfilter als für diesen
            Änderungssatz nicht einschlägig ausgeschlossen,{" "}
            {findings.length} geprüft.
          </p>

          {result.adrTokenUsage && result.adrTokenUsage.length > 0 ? (
            <details>
              <summary>Tokenverbrauch je ADR-Extraktion</summary>
              <table>
                <thead>
                  <tr>
                    <th>ADR</th>
                    <th>Regeln</th>
                    <th>Prompt-Tokens</th>
                    <th>Completion-Tokens</th>
                    <th>Gesamt</th>
                  </tr>
                </thead>
                <tbody>
                  {result.adrTokenUsage.map((usage) => (
                    <tr key={usage.adrFile}>
                      <td>
                        <code>{usage.adrFile}</code>
                      </td>
                      <td>{usage.extractedRules}</td>
                      <td>{usage.promptTokens.toLocaleString("de-DE")}</td>
                      <td>{usage.completionTokens.toLocaleString("de-DE")}</td>
                      <td>{usage.totalTokens.toLocaleString("de-DE")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          ) : null}

          {VERDICT_ORDER.map((verdict) => {
            const group = withVerdict(findings, verdict);
            if (group.length === 0) return null;
            return (
              // Verstöße stehen offen, weil sie den Anlass der Seite bilden
              // und die Sprungmarken aus den MR-Kommentaren auf sie zeigen. Die
              // übrigen Gruppen sind eingeklappt, bleiben aber einen Klick weit
              // entfernt (NFA-3).
              <details key={verdict} open={verdict === "NC"}>
                <summary className="section-toggle">
                  {VERDICT_LABEL[verdict]} ({group.length})
                </summary>
                {group.map((finding) => (
                  <FindingCard
                    key={finding.id}
                    finding={finding}
                    reviewId={review.id}
                    feedback={feedbackByFinding.get(finding.id)}
                  />
                ))}
              </details>
            );
          })}

          {result.droppedRules.length > 0 ? (
            <>
              <h2>Vom Vorfilter ausgeschlossen ({result.droppedRules.length})</h2>
              <details>
                <summary>Regeln ohne Bezug zu einer geänderten Datei</summary>
                <table>
                  <thead>
                    <tr>
                      <th>Regel</th>
                      <th>Herkunft</th>
                      <th>Grund</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.droppedRules.map((dropped) => (
                      <tr key={dropped.rule.id}>
                        <td>{dropped.rule.text}</td>
                        <td>
                          <code>{dropped.rule.adrFile}</code>
                        </td>
                        <td>{dropped.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </>
          ) : null}

          {result.failures.length > 0 ? (
            <>
              <h2>Fehlschläge ({result.failures.length})</h2>
              <p className="meta">
                Nicht formatgerechte Modellantworten. Sie werden verworfen statt
                als leeres Urteil gewertet (NFA-2).
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Stufe</th>
                    <th>Regel</th>
                    <th>Meldung</th>
                  </tr>
                </thead>
                <tbody>
                  {result.failures.map((failure, index) => (
                    <tr key={index}>
                      <td>{STAGE_LABEL[failure.stage] ?? failure.stage}</td>
                      <td>
                        <code>{failure.ruleId ?? "—"}</code>
                      </td>
                      <td>{failure.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}
        </>
      ) : (
        <p className="empty">Noch kein Ergebnis aus der Sandbox eingegangen.</p>
      )}

      {review.sandboxLog ? (
        <details>
          <summary>Containerprotokoll</summary>
          <pre>{review.sandboxLog}</pre>
        </details>
      ) : null}
    </>
  );
}
