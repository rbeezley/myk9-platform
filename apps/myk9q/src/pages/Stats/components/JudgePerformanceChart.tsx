import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { JudgeStat } from '../types/stats.types';

interface JudgePerformanceChartProps {
  data: JudgeStat[];
  onBarClick?: (judge: string) => void;
}

/** Extended judge data with display name and color for chart rendering */
interface ChartJudgeData extends JudgeStat {
  displayName: string;
  color: string;
}

/** Recharts tooltip props */
interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ChartJudgeData }>;
}

/** Recharts axis tick props */
interface AxisTickProps {
  x?: number;
  y?: number;
  payload?: { value: string };
}

// Custom tooltip component
const CustomTooltip = ({ active, payload }: TooltipProps) => {
  if (active && payload && payload[0]) {
    const data = payload[0].payload;
    return (
      <div style={{
        backgroundColor: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--token-space-md)',
        padding: 'var(--token-space-lg)',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
      }}>
        <p style={{
          fontWeight: 600,
          color: 'var(--foreground)',
          margin: 0,
          fontSize: '0.9375rem'
        }}>
          {data.displayName}
        </p>
        <div style={{ marginTop: 'var(--token-space-md)' }}>
          <p style={{
            color: 'var(--muted-foreground)',
            fontSize: '0.8125rem',
            margin: '0.25rem 0'
          }}>
            Classes Judged: {data.classesJudged}
          </p>
          <p style={{
            color: 'var(--muted-foreground)',
            fontSize: '0.8125rem',
            margin: '0.25rem 0'
          }}>
            Total Entries: {data.totalEntries}
          </p>
          <p style={{
            color: 'var(--muted-foreground)',
            fontSize: '0.8125rem',
            margin: '0.25rem 0'
          }}>
            Qualified: {data.qualifiedCount}
          </p>
          <p style={{
            color: 'var(--primary)',
            fontSize: '0.875rem',
            fontWeight: 600,
            margin: '0.25rem 0'
          }}>
            Rate: {data.qualificationRate.toFixed(1)}%
          </p>
          {data.averageQualifiedTime && (
            <p style={{
              color: 'var(--muted-foreground)',
              fontSize: '0.8125rem',
              margin: '0.25rem 0'
            }}>
              Avg Q Time: {data.averageQualifiedTime.toFixed(2)}s
            </p>
          )}
        </div>
      </div>
    );
  }
  return null;
};

// Custom X-axis tick component for mobile
const CustomXAxisTick = ({ x = 0, y = 0, payload }: AxisTickProps) => {
  const maxLength = window.innerWidth < 640 ? 12 : 20;
  const value = payload?.value || '';
  const displayText = value.length > maxLength
    ? value.substring(0, maxLength - 1) + '…'
    : value;

  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dy={16}
        textAnchor="end"
        fill="var(--muted-foreground)"
        fontSize="0.75rem"
        transform={window.innerWidth < 640 ? "rotate(-45)" : "rotate(-30)"}
      >
        {displayText}
      </text>
    </g>
  );
};

const JudgePerformanceChart: React.FC<JudgePerformanceChartProps> = ({ data, onBarClick }) => {
  // Prepare and limit data
  const chartData = useMemo(() => {
    // Sort by total entries and take top 10
    const sorted = [...data].sort((a, b) => b.totalEntries - a.totalEntries);
    const top10 = sorted.slice(0, 10);

    return top10.map(judge => ({
      ...judge,
      displayName: judge.judgeName || 'TBD',
      // Add color based on qualification rate
      color: judge.qualificationRate >= 80 ? 'var(--status-qualified)' :
             judge.qualificationRate >= 60 ? 'var(--status-at-gate)' :
             judge.qualificationRate >= 40 ? 'var(--status-in-ring)' :
             'var(--status-nq)'
    }));
  }, [data]);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={chartData}
        margin={{
          top: 20,
          right: 30,
          left: 60,  // Increased for Y-axis label
          bottom: 100  // Extra space for rotated judge names
        }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="displayName"
          tick={<CustomXAxisTick />}
          interval={0}
        />
        <YAxis
          label={{
            value: 'Qualification Rate (%)',
            angle: -90,
            position: 'insideLeft',
            offset: 10,
            style: {
              fill: 'var(--muted-foreground)',
              fontSize: '0.875rem',
              textAnchor: 'middle'
            }
          }}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar
          dataKey="qualificationRate"
          fill="var(--primary)"
          onClick={(data) => {
            // Recharts passes the data payload - cast to access our data type
            const payload = data as unknown as ChartJudgeData;
            if (onBarClick && payload?.judgeName) {
              onBarClick(payload.judgeName);
            }
          }}
          style={{ cursor: onBarClick ? 'pointer' : 'default' }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default JudgePerformanceChart;