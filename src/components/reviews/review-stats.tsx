import { findingsOf, verdictCounts } from "@/lib/findings";
import { formatDuration } from "@/lib/format";
import { REVIEW_STATUS_LABEL } from "@/lib/reviews";
import type { Review, RuleBaseOrigin, SandboxResult } from "@/lib/types";

const RULE_BASE_LABEL: Record<RuleBaseOrigin, string> = {
  learning: "Lernmodus",
  combined: "Projekt-ADRs + Gruppenstandards",
  group: "Gruppenstandard",
  project: "Projekt-ADRs",
};

const PHASE_LABEL = {
  checkoutMs: "Checkout",
  rulebaseMs: "Regelbasis",
  extractionMs: "Regelextraktion",
  triageMs: "Vorfilter",
  judgingMs: "Regelprüfung",
  analysisMs: "Code-Analyse",
} satisfies Record<keyof NonNullable<SandboxResult["stats"]["phases"]>, string>;

export function ReviewStats({ review }: { review: Review }) {
  const result = review.result;
  const learning = result?.mode === "learning";
  const findings = findingsOf(review);
  const counts = verdictCounts(findings);
  const stats = [
    { label: "Status", value: REVIEW_STATUS_LABEL[review.status] },
    { label: "Regelbasis", value: result ? RULE_BASE_LABEL[learning ? "learning" : result.ruleOrigin] : "—" },
    { label: learning ? "Lernhinweise" : "Regeln geprüft", value: findings.length },
    ...(!learning ? [{ label: "Verstöße", value: counts.NC, color: "var(--nc)" }] : []),
    ...(!learning ? [{ label: "Nicht entscheidbar", value: counts.CIA, color: "var(--cia)" }] : []),
    { label: "Laufzeit", value: result ? formatDuration(result.stats.durationMs) : "—" },
  ];
  return (
    <>
      <div className="stats">
        {stats.map((stat, index) => (
          <div key={index}>
            <span className="stat-label">{stat.label}</span>
            <span className="stat-value" style={{ color: stat.color }}>{stat.value}</span>
          </div>
        ))}
      </div>
      {result?.stats.phases ? (
        <section className="review-timings" aria-label="Laufzeiten je Phase">
          <h2>Laufzeiten je Phase</h2>
          <dl>
            {Object.entries(result.stats.phases).map(([phase, duration]) => (
              <div key={phase}>
                <dt>{PHASE_LABEL[phase as keyof typeof PHASE_LABEL] ?? phase}</dt>
                <dd>{typeof duration === "number" ? formatDuration(duration) : "—"}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </>
  );
}
