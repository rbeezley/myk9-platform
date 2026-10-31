import React from 'react';
import { resultStatusLabel, type ResultStatus } from './resultStatusLabel';

/** Known result status values from the scoring system */
export type { ResultStatus };

/** Map from abbreviated result_text to color class */
const RESULT_COLORS: Record<string, string> = {
  Q: 'bg-success/15 text-success border-success/30',
  NQ: 'bg-destructive/15 text-destructive border-destructive/30',
  DQ: 'bg-zinc-900 text-white border-zinc-900',
};

const DEFAULT_COLOR = 'bg-muted text-muted-foreground border-border';

interface ResultBadgeProps {
  /** Raw result_status value (e.g. 'qualified', 'nq') */
  resultStatus: string;
  /** 'compact' for inline class lists, 'large' for dashboard cards */
  variant?: 'compact' | 'large';
}

/**
 * Shared badge for Q/NQ/ABS/EX/WD results.
 * Accepts raw result_status and abbreviates automatically.
 */
export const ResultBadge: React.FC<ResultBadgeProps> = ({ resultStatus, variant = 'compact' }) => {
  const label = resultStatusLabel(resultStatus);
  const colorClass = RESULT_COLORS[label] ?? DEFAULT_COLOR;

  const sizeClass =
    variant === 'large' ? 'px-3 py-1 text-base font-bold' : 'px-2 py-0.5 text-xs font-bold';

  return (
    <span className={`inline-flex items-center rounded border ${colorClass} ${sizeClass}`}>
      {label}
    </span>
  );
};
