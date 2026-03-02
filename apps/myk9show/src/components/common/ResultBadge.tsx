import React from 'react';

/** Known result status values from the scoring system */
export type ResultStatus = 'qualified' | 'nq' | 'absent' | 'excused' | 'withdrawn';

/** Map from raw result_status to abbreviated label */
const STATUS_LABELS: Record<ResultStatus, string> = {
  qualified: 'Q',
  nq: 'NQ',
  absent: 'ABS',
  excused: 'EX',
  withdrawn: 'WD',
};

/** Map from abbreviated result_text to color class */
const RESULT_COLORS: Record<string, string> = {
  Q: 'bg-success-green/15 text-success-green border-success-green/30',
  NQ: 'bg-error-red/15 text-error-red border-error-red/30',
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
  const label = STATUS_LABELS[resultStatus as ResultStatus] ?? resultStatus.toUpperCase();
  const colorClass = RESULT_COLORS[label] ?? DEFAULT_COLOR;

  const sizeClass =
    variant === 'large' ? 'px-3 py-1 text-base font-bold' : 'px-2 py-0.5 text-xs font-bold';

  return (
    <span className={`inline-flex items-center rounded border ${colorClass} ${sizeClass}`}>
      {label}
    </span>
  );
};
