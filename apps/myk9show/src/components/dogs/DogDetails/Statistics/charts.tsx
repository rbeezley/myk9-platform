import React from 'react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  AreaChart,
  Area,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';
import type { PieLabelRenderProps } from 'recharts';
import type {
  StatusBreakdown,
  ElementStats,
  JudgeStats,
  TimelinePoint,
} from '@/services/performanceStatsEngine';

// Recharts v3 uses readonly arrays in tooltip props, causing strict TS errors.
// Use the same type-cast pattern from PerformanceGraphs.tsx.
const Tooltip = RechartsTooltip as React.ComponentType<
  React.ComponentProps<typeof RechartsTooltip>
>;

// ========================================
// COLORS (matching myK9Q palette)
// ========================================

const STATUS_COLORS: Record<string, string> = {
  Qualified: '#10b981',
  NQ: '#ef4444',
  Absent: '#8b5cf6',
  Excused: '#fbbf24',
  Withdrawn: '#6b7280',
};

const Q_RATE_COLOR = (rate: number) => {
  if (rate >= 80) return '#10b981';
  if (rate >= 50) return '#fbbf24';
  return '#ef4444';
};

// ========================================
// CUSTOM TOOLTIPS
// ========================================

interface TooltipPayload<T> {
  active?: boolean;
  payload?: readonly { payload: T }[];
}

const tooltipStyle: React.CSSProperties = {
  backgroundColor: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  padding: '8px 12px',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
};

// ========================================
// RESULTS DISTRIBUTION PIE CHART
// ========================================

interface ResultsDistributionChartProps {
  overall: StatusBreakdown;
}

interface PieEntry {
  name: string;
  value: number;
  percentage: number;
  color: string;
}

const RADIAN = Math.PI / 180;

function renderCustomLabel(props: PieLabelRenderProps) {
  const { cx, cy, midAngle, innerRadius, outerRadius, percent, name } =
    props as PieLabelRenderProps & {
      cx: number;
      cy: number;
      midAngle: number;
      innerRadius: number;
      outerRadius: number;
      percent: number;
      name: string;
    };

  if ((percent ?? 0) < 0.05) return null;
  const radius = (innerRadius ?? 0) + ((outerRadius ?? 0) - (innerRadius ?? 0)) * 0.5;
  const x = (cx ?? 0) + radius * Math.cos(-(midAngle ?? 0) * RADIAN);
  const y = (cy ?? 0) + radius * Math.sin(-(midAngle ?? 0) * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={12}>
      {name} {((percent ?? 0) * 100).toFixed(0)}%
    </text>
  );
}

export const ResultsDistributionChart: React.FC<ResultsDistributionChartProps> = ({ overall }) => {
  const entries: PieEntry[] = [
    { name: 'Qualified', value: overall.qualified, percentage: 0, color: STATUS_COLORS.Qualified },
    { name: 'NQ', value: overall.nq, percentage: 0, color: STATUS_COLORS.NQ },
    { name: 'Absent', value: overall.absent, percentage: 0, color: STATUS_COLORS.Absent },
    { name: 'Excused', value: overall.excused, percentage: 0, color: STATUS_COLORS.Excused },
    { name: 'Withdrawn', value: overall.withdrawn, percentage: 0, color: STATUS_COLORS.Withdrawn },
  ].filter(e => e.value > 0);

  const total = entries.reduce((s, e) => s + e.value, 0);
  for (const e of entries) {
    e.percentage = total > 0 ? (e.value / total) * 100 : 0;
  }

  return (
    <div className="border rounded-xl p-4">
      <h3 className="text-sm font-semibold mb-3">Results Distribution</h3>
      <ResponsiveContainer width="100%" height={250}>
        <PieChart>
          <Pie
            data={entries}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={90}
            dataKey="value"
            label={renderCustomLabel}
            labelLine={false}
          >
            {entries.map(entry => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }: TooltipPayload<PieEntry>) => {
              if (!active || !payload?.[0]) return null;
              const d = payload[0].payload;
              return (
                <div style={tooltipStyle}>
                  <p className="font-semibold text-foreground text-sm">{d.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.value} ({d.percentage.toFixed(1)}%)
                  </p>
                </div>
              );
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

// ========================================
// ELEMENT BREAKDOWN BAR CHART
// ========================================

interface ElementBreakdownChartProps {
  byElement: ElementStats[];
}

export const ElementBreakdownChart: React.FC<ElementBreakdownChartProps> = ({ byElement }) => {
  if (byElement.length === 0) return null;

  const data = byElement.map(e => ({
    element: e.element,
    qRate: e.breakdown.qRate,
    total: e.breakdown.total,
    qualified: e.breakdown.qualified,
    fill: Q_RATE_COLOR(e.breakdown.qRate),
  }));

  return (
    <div className="border rounded-xl p-4">
      <h3 className="text-sm font-semibold mb-3">Q Rate by Element</h3>
      <ResponsiveContainer width="100%" height={Math.max(200, data.length * 40 + 40)}>
        <BarChart data={data} layout="vertical" margin={{ left: 80 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} />
          <YAxis type="category" dataKey="element" width={75} tick={{ fontSize: 12 }} />
          <Tooltip
            content={({ active, payload }: TooltipPayload<(typeof data)[0]>) => {
              if (!active || !payload?.[0]) return null;
              const d = payload[0].payload;
              return (
                <div style={tooltipStyle}>
                  <p className="font-semibold text-foreground text-sm">{d.element}</p>
                  <p className="text-xs text-muted-foreground">
                    Q Rate: {d.qRate}% ({d.qualified}/{d.total})
                  </p>
                </div>
              );
            }}
          />
          <Bar dataKey="qRate" radius={[0, 4, 4, 0]}>
            {data.map(entry => (
              <Cell key={entry.element} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

// ========================================
// JUDGE PERFORMANCE BAR CHART
// ========================================

interface JudgePerformanceChartProps {
  byJudge: JudgeStats[];
}

export const JudgePerformanceChart: React.FC<JudgePerformanceChartProps> = ({ byJudge }) => {
  if (byJudge.length === 0) return null;

  const data = byJudge.slice(0, 10).map(j => ({
    judge: j.judge,
    displayName: j.judge.length > 15 ? j.judge.substring(0, 15) + '...' : j.judge,
    qRate: j.breakdown.qRate,
    total: j.breakdown.total,
    qualified: j.breakdown.qualified,
  }));

  return (
    <div className="border rounded-xl p-4">
      <h3 className="text-sm font-semibold mb-3">Q Rate by Judge</h3>
      <ResponsiveContainer width="100%" height={Math.max(200, data.length * 40 + 40)}>
        <BarChart data={data} layout="vertical" margin={{ left: 100 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} />
          <YAxis type="category" dataKey="displayName" width={95} tick={{ fontSize: 12 }} />
          <Tooltip
            content={({ active, payload }: TooltipPayload<(typeof data)[0]>) => {
              if (!active || !payload?.[0]) return null;
              const d = payload[0].payload;
              return (
                <div style={tooltipStyle}>
                  <p className="font-semibold text-foreground text-sm">{d.judge}</p>
                  <p className="text-xs text-muted-foreground">
                    Classes: {d.total} | Qualified: {d.qualified}
                  </p>
                  <p className="text-sm font-semibold text-primary">Rate: {d.qRate}%</p>
                </div>
              );
            }}
          />
          <Bar dataKey="qRate" fill="#10b981" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

// ========================================
// PROGRESS TIMELINE AREA CHART
// ========================================

interface ProgressTimelineChartProps {
  timeline: TimelinePoint[];
}

export const ProgressTimelineChart: React.FC<ProgressTimelineChartProps> = ({ timeline }) => {
  if (timeline.length < 2) return null;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
  };

  return (
    <div className="border rounded-xl p-4">
      <h3 className="text-sm font-semibold mb-3">Cumulative Qualifying Legs</h3>
      <ResponsiveContainer width="100%" height={250}>
        <AreaChart data={timeline} margin={{ left: 10, right: 10 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <Tooltip
            content={({ active, payload }: TooltipPayload<TimelinePoint>) => {
              if (!active || !payload?.[0]) return null;
              const d = payload[0].payload;
              return (
                <div style={tooltipStyle}>
                  <p className="text-xs text-muted-foreground">{formatDate(d.date)}</p>
                  <p className="font-semibold text-foreground text-sm">
                    {d.cumulativeQLegs} qualifying legs
                  </p>
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="cumulativeQLegs"
            stroke="#10b981"
            fill="#10b981"
            fillOpacity={0.15}
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
