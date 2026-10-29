"use client";

export interface DashboardDay {
  date: string;
  label: string;
  reviews: number;
  failed: number;
  promptTokens: number;
  completionTokens: number;
}

const chartWidth = 800;
const chartHeight = 220;
const left = 48;
const right = 12;
const top = 22;
const bottom = 34;

function formatNumber(value: number): string {
  return new Intl.NumberFormat("de-DE", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function DashboardAreaChart({
  data,
  series,
  ariaLabel,
}: {
  data: DashboardDay[];
  series: Array<{ key: keyof DashboardDay; label: string; color: string }>;
  ariaLabel: string;
}) {
  const plotWidth = chartWidth - left - right;
  const plotHeight = chartHeight - top - bottom;
  const maxValue = Math.max(1, ...data.map((day) => series.reduce((sum, item) => sum + Number(day[item.key]), 0)));
  const ticks = [0, maxValue / 2, maxValue];
  const x = (index: number) => left + (data.length <= 1 ? 0 : (index / (data.length - 1)) * plotWidth);
  const y = (value: number) => top + plotHeight - (value / maxValue) * plotHeight;
  const hasValues = data.some((day) => series.some((item) => Number(day[item.key]) > 0));

  return (
    <div className="dashboard-chart-plot">
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label={ariaLabel} preserveAspectRatio="none">
        {ticks.map((tick) => (
          <line key={tick} x1={left} x2={chartWidth - right} y1={y(tick)} y2={y(tick)} stroke="var(--chart-grid)" strokeDasharray="3 3" />
        ))}
        {series.map((item) => {
          const points = data.map((day, index) => `${x(index)},${y(Number(day[item.key]))}`).join(" ");
          return <polyline key={item.key} points={points} fill="none" stroke={item.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />;
        })}
      </svg>
      <div className="dashboard-chart-y-labels" aria-hidden="true">
        {ticks.map((tick) => <span key={tick} style={{ top: `${(y(tick) / chartHeight) * 100}%` }}>{formatNumber(tick)}</span>)}
      </div>
      <div className="dashboard-chart-x-labels" aria-hidden="true">
        {data.map((day, index) => index % 5 === 0 || index === data.length - 1 ? (
          <span key={day.date} style={{ left: `${(x(index) / chartWidth) * 100}%` }}>{day.label}</span>
        ) : null)}
      </div>
      {!hasValues ? <div className="dashboard-chart-empty">Noch keine Daten für den Zeitraum</div> : null}
      <div className="dashboard-chart-legend" aria-hidden="true">
        {series.map((item) => <span key={item.key}><i style={{ background: item.color }} />{item.label}</span>)}
      </div>
    </div>
  );
}

export function DashboardCharts({ data }: { data: DashboardDay[] }) {
  return (
    <div className="dashboard-chart-grid">
      <section className="ui-card dashboard-chart-card">
        <header className="dashboard-chart-header">
          <div><h2>Gestartete Merge Requests</h2><p>Gestartete Reviews pro Tag · letzte 30 Tage</p></div>
        </header>
        <div className="dashboard-chart">
          <DashboardAreaChart
            data={data}
            ariaLabel="Gestartete Merge Requests pro Tag für die letzten 30 Tage"
            series={[{ key: "reviews", label: "Gestartet", color: "var(--chart-primary)" }]}
          />
        </div>
      </section>

      <section className="ui-card dashboard-chart-card">
        <header className="dashboard-chart-header">
          <div><h2>Fehlgeschlagene Merge Requests</h2><p>Fehlgeschlagene Reviews pro Tag · letzte 30 Tage</p></div>
        </header>
        <div className="dashboard-chart">
          <DashboardAreaChart
            data={data}
            ariaLabel="Fehlgeschlagene Merge Requests pro Tag für die letzten 30 Tage"
            series={[{ key: "failed", label: "Fehlgeschlagen", color: "var(--chart-error)" }]}
          />
        </div>
      </section>

      <section className="ui-card dashboard-chart-card">
        <header className="dashboard-chart-header">
          <div><h2>Token-Verbrauch</h2><p>Prompt- und Completion-Tokens pro Tag · letzte 30 Tage</p></div>
        </header>
        <div className="dashboard-chart dashboard-chart-tokens">
          <DashboardAreaChart
            data={data}
            ariaLabel="Prompt- und Completion-Tokens pro Tag für die letzten 30 Tage"
            series={[
              { key: "promptTokens", label: "Prompt", color: "var(--chart-secondary)" },
              { key: "completionTokens", label: "Completion", color: "var(--chart-primary)" },
            ]}
          />
        </div>
      </section>
    </div>
  );
}
