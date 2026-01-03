import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import type { StatsData } from '../types/stats.types';

interface QualificationChartProps {
  data: StatsData;
  onSegmentClick?: (filters: { breed?: string; judge?: string }) => void;
}

/** Data shape for pie chart entries */
interface PieChartEntry {
  name: string;
  value: number;
  percentage: number;
  color: string;
}

/** Recharts tooltip props for pie chart */
interface TooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    payload: PieChartEntry;
  }>;
}

// Custom tooltip component
const CustomTooltip = ({ active, payload }: TooltipProps) => {
  if (active && payload && payload[0]) {
    const data = payload[0];
    return (
      <div style={{
        backgroundColor: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--token-space-md)',
        padding: 'var(--token-space-md)',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
      }}>
        <p style={{
          fontWeight: 600,
          color: 'var(--foreground)',
          margin: 0
        }}>
          {data.name}
        </p>
        <p style={{
          color: 'var(--muted-foreground)',
          fontSize: '0.875rem',
          margin: '0.25rem 0 0 0'
        }}>
          Count: {data.value}
        </p>
        <p style={{
          color: 'var(--muted-foreground)',
          fontSize: '0.875rem',
          margin: '0.25rem 0 0 0'
        }}>
          Rate: {data.payload.percentage.toFixed(1)}%
        </p>
      </div>
    );
  }
  return null;
};

const QualificationChart: React.FC<QualificationChartProps> = ({ data, onSegmentClick }) => {
  // Prepare data for pie chart with colors matching the status badges
  const chartData = [
    {
      name: 'Qualified',
      value: data.qualifiedCount,
      percentage: data.qualificationRate,
      color: '#10b981' // Green - matches qualified badge
    },
    {
      name: 'NQ',
      value: data.nqCount,
      percentage: data.nqRate,
      color: '#ef4444' // Red - matches not-qualified badge
    },
    {
      name: 'Excused',
      value: data.excusedCount,
      percentage: data.excusedRate,
      color: '#fbbf24' // Amber/yellow - warning color
    },
    {
      name: 'Absent',
      value: data.absentCount,
      percentage: data.absentRate,
      color: '#8b5cf6' // Purple - matches absent status
    }
  ].filter(item => item.value > 0); // Only show segments with data

  // Custom label
  const renderCustomLabel = (props: unknown) => {
    // Recharts PieLabelRenderProps - cast to access our data
    const entry = props as PieChartEntry;
    if (!entry?.percentage || entry.percentage < 5) return null; // Don't show label for small segments
    return `${entry.percentage.toFixed(1)}%`;
  };

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={renderCustomLabel}
          outerRadius={80}
          fill="#8884d8"
          dataKey="value"
        >
          {chartData.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={entry.color}
              style={{ cursor: onSegmentClick ? 'pointer' : 'default' }}
              onClick={() => {
                // Could implement filtering by result status if needed
}}
            />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend
          verticalAlign="bottom"
          height={36}
          formatter={(value: string) => (
            <span style={{ color: 'var(--foreground)', fontSize: '0.875rem' }}>
              {value}
            </span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
};

export default QualificationChart;