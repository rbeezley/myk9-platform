/**
 * ScoresheetTimerCard -- the compact timer block every timed sheet shares
 * (MYK9-1501).
 *
 * Elapsed time and the remaining/limit line sit in one block, with the thin
 * progress bar under them and the controls on a single row beneath
 * (Start/Stop/Resume with Reset beside it). Each sport passes in its own live
 * pieces wrapped in `<StopwatchTime>` and its own buttons: the timer logic is
 * the sport's, this only owns the shape.
 */

import React, { type ReactNode } from 'react';
import { Card } from '@myk9/ui';

/** Primary timer button (Start, Stop, Resume): fills the row beside Reset. */
export const timerPrimaryButtonClass =
  'h-12 min-w-0 flex-[2] rounded-xl text-lg font-semibold shadow-sm hover:brightness-110';

/** Secondary timer button (Reset, Finish): the smaller half of the row. */
export const timerSecondaryButtonClass =
  'h-12 min-w-0 flex-1 gap-2 rounded-xl text-base font-semibold';

export interface ScoresheetTimerCardProps {
  /** The big elapsed time. */
  clock: ReactNode;
  /** Small label above the clock ("Search Time"). */
  label?: ReactNode;
  /** "Remaining 2:41.20" / "Max Time: 3:00" and the like, to the right of the clock. */
  limit?: ReactNode;
  /** A ring or similar, beside the limit line. */
  aside?: ReactNode;
  /** The thin remaining-time bar. */
  progress?: ReactNode;
  /** Anything that belongs above the clock (the dual timer's element row). */
  above?: ReactNode;
  /** The controls row: buttons only. */
  children: ReactNode;
}

export const ScoresheetTimerCard: React.FC<ScoresheetTimerCardProps> = ({
  clock,
  label,
  limit,
  aside,
  progress,
  above,
  children,
}) => (
  <Card className="relative overflow-hidden p-3" data-testid="scoresheet-timer-card">
    {above}
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        {label && (
          <div className="text-xs uppercase leading-none tracking-wider text-muted-foreground">
            {label}
          </div>
        )}
        <div className="text-4xl font-bold tabular-nums leading-tight tracking-tight">{clock}</div>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        {limit && (
          <div className="text-right text-sm tabular-nums text-muted-foreground">{limit}</div>
        )}
        {aside}
      </div>
    </div>
    {progress}
    <div className="mt-2 flex flex-wrap gap-2">{children}</div>
  </Card>
);
