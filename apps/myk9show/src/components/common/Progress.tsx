import * as React from "react";

interface ProgressProps {
  value: number; // percent 0-100
  color?: string; // tailwind color class, e.g. 'bg-blue-500'
  className?: string;
}

export const Progress: React.FC<ProgressProps> = ({ value, color = "bg-primary", className = "" }) => (
  <div className={`w-full h-2 bg-muted rounded-full overflow-hidden ${className}`} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
    <div
      className={`h-full rounded-full transition-all duration-300 ${color}`}
      style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }}
    />
  </div>
);
