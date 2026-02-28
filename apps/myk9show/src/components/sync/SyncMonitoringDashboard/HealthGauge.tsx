import React from 'react';
import { cn } from '../../../lib/utils';
import type { HealthGaugeProps } from './types';

const HealthGauge: React.FC<HealthGaugeProps> = ({ score, label }) => {
  const getTextColor = (s: number) => {
    if (s >= 90) return 'text-green-500';
    if (s >= 70) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getColor = (s: number) => {
    if (s >= 90) return '#22c55e';
    if (s >= 70) return '#eab308';
    return '#ef4444';
  };

  const color = getColor(score);
  const deg = (score / 100) * 360;

  return (
    <div className="relative flex flex-col items-center">
      {/* Outer ring via conic-gradient */}
      <div
        className="relative w-32 h-32 rounded-full"
        style={{
          background: `conic-gradient(${color} ${deg}deg, hsl(0 0% 30% / 0.3) ${deg}deg 360deg)`,
        }}
      >
        {/* Inner cutout to create the donut */}
        <div className="absolute inset-[10px] rounded-full bg-card flex items-center justify-center">
          <span className={cn('text-3xl font-bold', getTextColor(score))}>{score}%</span>
        </div>
      </div>
      <p className="mt-2 text-sm font-medium text-muted-foreground">{label}</p>
    </div>
  );
};

export { HealthGauge };
