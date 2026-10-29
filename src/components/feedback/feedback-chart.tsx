"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface FeedbackChartEntry {
  label: string;
  count: number;
  color: string;
}

function FeedbackTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: FeedbackChartEntry }>;
}) {
  const entry = payload?.[0]?.payload;
  if (!active || !entry) return null;

  return (
    <div className="dashboard-tooltip">
      <strong>{entry.label}</strong>
      <span>{new Intl.NumberFormat("de-DE").format(entry.count)} Rückmeldungen</span>
    </div>
  );
}

export function FeedbackChart({ data }: { data: FeedbackChartEntry[] }) {
  return (
    <div className="feedback-chart" role="img" aria-label={`${data[0]?.count ?? 0} hilfreiche und ${data[1]?.count ?? 0} nicht hilfreiche Rückmeldungen`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 20, left: 12, bottom: 8 }} barCategoryGap={24}>
          <CartesianGrid horizontal={false} stroke="var(--chart-grid)" strokeDasharray="3 3" />
          <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "var(--chart-muted)", fontSize: 12 }} />
          <YAxis type="category" dataKey="label" width={125} axisLine={false} tickLine={false} tick={{ fill: "var(--chart-muted)", fontSize: 13 }} />
          <Tooltip content={<FeedbackTooltip />} cursor={{ fill: "var(--chart-grid)", opacity: 0.25 }} />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={32}>
            {data.map((entry) => <Cell key={entry.label} fill={entry.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
