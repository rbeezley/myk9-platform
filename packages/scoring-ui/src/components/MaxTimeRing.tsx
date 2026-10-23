/**
 * MaxTimeRing -- the countdown ring in a timer card's corner, shared by the
 * scoresheets that draw one (MYK9-1364).
 *
 * It takes the remaining ms as a prop and holds no timer of its own: wrap it in
 * `<StopwatchTime>` so the live clock re-renders just the ring, not the sheet.
 */

import React from 'react';

/** Green with time to spare, amber inside 40s, red inside 30s: shared with progress bars. */
export function remainingColor(remainingMs: number): string {
  const remainingSeconds = remainingMs / 1000;
  if (remainingSeconds <= 0) return '#ef4444';
  if (remainingSeconds <= 30) return '#ef4444';
  if (remainingSeconds <= 40) return '#f59e0b';
  return '#22c55e';
}

const RING_SIZE = 40;
const STROKE_WIDTH = 4;
const RADIUS = (RING_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export const MaxTimeRing: React.FC<{
  className: string;
  remainingMs: number;
  maxTimeMs: number;
  /** Decorative rings are hidden from assistive tech; UKC also tags it for tests. */
  testId?: string;
  decorative?: boolean;
}> = ({ className, remainingMs, maxTimeMs, testId, decorative }) => {
  const progress = maxTimeMs > 0 ? Math.max(0, remainingMs / maxTimeMs) : 1;
  return (
    <svg
      className={className}
      aria-hidden={decorative ? 'true' : undefined}
      data-testid={testId}
      width={RING_SIZE}
      height={RING_SIZE}
      viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
    >
      <circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RADIUS}
        fill="none"
        stroke="currentColor"
        strokeWidth={STROKE_WIDTH}
        className="text-muted/20"
      />
      <circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RADIUS}
        fill="none"
        stroke={remainingColor(remainingMs)}
        strokeWidth={STROKE_WIDTH}
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
        transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
      />
    </svg>
  );
};
