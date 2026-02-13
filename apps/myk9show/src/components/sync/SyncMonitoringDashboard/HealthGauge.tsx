import React from 'react';
import { cn } from '../../../lib/utils';
import type { HealthGaugeProps } from './types';

const HealthGauge: React.FC<HealthGaugeProps> = ({ score, label }) => {
  const getColor = (s: number) => {
    if (s >= 90) return 'text-green-600';
    if (s >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getGradient = (s: number) => {
    if (s >= 90) return 'from-green-500 to-green-600';
    if (s >= 70) return 'from-yellow-500 to-yellow-600';
    return 'from-red-500 to-red-600';
  };

  return (
    <div className="relative flex flex-col items-center">
      <div className="relative w-32 h-32">
        <svg className="w-full h-full transform -rotate-90">
          <circle
            cx="64"
            cy="64"
            r="56"
            stroke="currentColor"
            strokeWidth="12"
            fill="none"
            className="text-gray-200"
          />
          <circle
            cx="64"
            cy="64"
            r="56"
            stroke="url(#gradient)"
            strokeWidth="12"
            fill="none"
            strokeDasharray={`${(score / 100) * 351.86} 351.86`}
            className="transition-all duration-1000"
          />
          <defs>
            <linearGradient id="gradient">
              <stop offset="0%" className={cn("transition-all", getGradient(score))} />
              <stop offset="100%" className={cn("transition-all", getGradient(score))} />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn("text-3xl font-bold", getColor(score))}>
            {score}%
          </span>
        </div>
      </div>
      <p className="mt-2 text-sm font-medium text-muted-foreground">{label}</p>
    </div>
  );
};

export { HealthGauge };
