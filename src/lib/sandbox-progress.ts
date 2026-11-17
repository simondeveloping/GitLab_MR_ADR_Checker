import type { Review } from "./types";

type Progress = NonNullable<Review["sandboxProgress"]>;

// Phasengewichte schätzen den Gesamtfortschritt; innerhalb einer Phase zählen
// ausschließlich erledigte Einheiten, unabhängig von ihrer Startreihenfolge.
const PHASES: Record<string, { start: number; end: number; label: string }> = {
  extraction: { start: 25, end: 35, label: "ADR-Dokumente" },
  judging: { start: 40, end: 92, label: "Regeln" },
  architecture_search: { start: 40, end: 68, label: "Änderungseinheiten" },
  architecture_verify: { start: 68, end: 92, label: "Verstoßkandidaten" },
  learning_collect: { start: 30, end: 55, label: "Diffteile" },
  learning_integration: { start: 55, end: 65, label: "Integrationspakete" },
  learning_verify: { start: 65, end: 82, label: "Kandidaten" },
  learning_deduplicate: { start: 82, end: 90, label: "Vergleichspakete" },
  learning_describe: { start: 90, end: 95, label: "Kommentare" },
};

export class SandboxProgressTracker {
  snapshot: Progress;
  private readonly countedPhases = new Set<string>();
  private readonly judgedRules = new Set<string>();
  private readonly collectedChunks = new Set<string>();
  private totalRules = 0;
  private totalChunks = 0;

  constructor(startedAt: string) {
    this.snapshot = {
      phase: "starting", percent: 3,
      message: "Podman startet den Sandbox-Container.", updatedAt: startedAt,
    };
  }

  set(phase: string, percent: number, message: string): void {
    this.snapshot = {
      phase, message,
      // Auch verspätete Meldungen paralleler Jobs lassen den Balken nicht zurückspringen.
      // 100 % gehört ausschließlich zum abgeschlossenen Review-Status.
      percent: Math.min(99, Math.max(this.snapshot.percent, percent)),
      updatedAt: new Date().toISOString(),
    };
  }

  private units(phase: string, completed: number, total: number): void {
    const spec = PHASES[phase];
    const done = Math.min(completed, total);
    this.set(phase, spec.start + Math.floor((spec.end - spec.start) * (total ? done / total : 1)),
      `${spec.label}: ${done} von ${total} bearbeitet …`);
    this.snapshot.completedUnits = done;
    this.snapshot.totalUnits = total;
  }

  consume(event: string, fields: Record<string, unknown>): boolean {
    const stage = (phase: string, percent: number, message: string) => {
      if (!this.countedPhases.has(phase)) this.set(phase, percent, message);
    };
    switch (event) {
      case "phase_progress": {
        const { phase, completed, total } = fields;
        if (typeof phase !== "string" || !Object.hasOwn(PHASES, phase) ||
          typeof completed !== "number" || !Number.isSafeInteger(completed) || completed < 0 ||
          typeof total !== "number" || !Number.isSafeInteger(total) || total < 0) return false;
        this.countedPhases.add(phase);
        this.units(phase, completed, total);
        break;
      }
      case "run_start":
        this.set("running", 8, "Review wird vorbereitet …");
        break;
      case "checkout_done":
        this.set("checkout", 18, "Änderungen werden für die Prüfung vorbereitet …");
        break;
      case "rulebase_selected":
        this.set("rulebase", 25, "Prüfkriterien werden geladen …");
        break;
      case "rules_extracted":
        stage("extraction", 25, "Prüfkriterien werden vorbereitet …");
        break;
      case "extraction_done":
        this.set("triage", 35, "Relevante Prüfkriterien werden ermittelt …");
        break;
      case "triage_done":
        this.set("judging", 40, "Die Codeänderungen werden geprüft …");
        break;
      case "rule_start":
        if (typeof fields.of === "number" && Number.isSafeInteger(fields.of) && fields.of > 0) this.totalRules = fields.of;
        if (!this.countedPhases.has("judging") && this.totalRules) {
          this.units("judging", this.judgedRules.size, this.totalRules);
        }
        break;
      case "rule_judged":
        if (typeof fields.ruleId === "string") this.judgedRules.add(fields.ruleId);
        if (!this.countedPhases.has("judging") && this.totalRules) {
          this.units("judging", this.judgedRules.size, this.totalRules);
        }
        break;
      case "learning_plan":
        this.totalChunks = typeof fields.chunks === "number" && Number.isSafeInteger(fields.chunks) && fields.chunks > 0 ? fields.chunks : 0;
        stage("learning_collect", 30, "Diffteile werden mit dem Repository analysiert …");
        break;
      case "learning_collect_done":
        if (typeof fields.unit === "string") this.collectedChunks.add(fields.unit);
        if (!this.countedPhases.has("learning_collect") && this.totalChunks) {
          this.units("learning_collect", this.collectedChunks.size, this.totalChunks);
        }
        break;
      case "learning_integration_start":
        stage("learning_integration", 55, "Dateiübergreifende Zusammenhänge werden geprüft …");
        break;
      case "learning_verification_start":
        stage("learning_verify", 65, "Kandidaten werden am Originalcode verifiziert …");
        break;
      case "learning_deduplication_start":
        stage("learning_deduplicate", 82, "Bestätigte Befunde werden auf doppelte Ursachen geprüft …");
        break;
      case "learning_description_start":
        stage("learning_describe", 90, "Verifizierte Kommentare werden formuliert …");
        break;
      case "run_summary":
        this.set("finishing", 95, "Prüfung abgeschlossen; Ergebnisse werden gespeichert …");
        break;
      case "callback_sent":
        this.set("callback", 98, "Ergebnisse werden fertiggestellt …");
        break;
      case "error":
      case "run_failed":
        this.set("error", this.snapshot.percent, "Die Prüfung wird beendet. Ergebnisse werden geprüft …");
        break;
      default:
        return false;
    }
    return true;
  }
}
