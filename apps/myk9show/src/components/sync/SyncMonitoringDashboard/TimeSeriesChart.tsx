import React from 'react';
import type { TimeSeriesChartProps } from './types';

const TimeSeriesChart: React.FC<TimeSeriesChartProps> = ({
  data,
  label,
  color = "#007AFF"
}) => {
  const maxValue = Math.max(...data.map(d => d.value));
  const minValue = Math.min(...data.map(d => d.value));
  const range = maxValue - minValue || 1;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">
          {data[data.length - 1]?.value.toFixed(1)}
        </p>
      </div>
      <div className="relative h-24 bg-gray-50 rounded-lg p-2">
        <svg className="w-full h-full">
          <polyline
            fill="none"
            stroke={color}
            strokeWidth="2"
            points={data.map((d, i) => {
              const x = (i / (data.length - 1)) * 100;
              const y = 100 - ((d.value - minValue) / range) * 100;
              return `${x},${y}`;
            }).join(' ')}
            className="drop-shadow-sm"
          />
          {data.map((d, i) => {
            const x = (i / (data.length - 1)) * 100;
            const y = 100 - ((d.value - minValue) / range) * 100;
            return (
              <circle
                key={i}
                cx={`${x}%`}
                cy={`${y}%`}
                r="3"
                fill={color}
                className="drop-shadow-sm"
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
};

export { TimeSeriesChart };
