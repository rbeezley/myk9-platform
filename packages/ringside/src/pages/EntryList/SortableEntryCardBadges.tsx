/**
 * Small presentational pieces of the entry card trailing column: the check-in
 * badge, the exhibitor's queue pill and conflict chip, and the score-reset
 * button. Extracted from SortableEntryCard (MYK9-1365) so the card file stays
 * under the line budget; no behavior of their own beyond the badge pulse.
 */

import React from 'react';
import { cn } from '@myk9/ui';
import type { Entry } from '../../stores/entryStore';
import { formatDogsAheadInList, type DogsAheadResult } from './dogsAheadInList';
import { CheckInIndicator, getCheckInPresentation } from './CheckInIndicator';

/**
 * Status badge for unscored entries
 */
interface StatusBadgeProps {
  entry: Entry;
  isDisabled: boolean;
  onClick: (e: React.MouseEvent) => void;
  /** Draw on the solid primary hero card. */
  inverse?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  entry,
  isDisabled,
  onClick,
  inverse,
}) => {
  const displayStatus = entry.inRing ? 'in-ring' : entry.status;

  // Pulse when the dog's status (or a realtime timestamp, when the host sets
  // one) changes while the badge stays mounted. The list used to key each card
  // on status + scored, so every change remounted the card and this effect
  // could only ever see its first value; it is now driven by the change itself
  // (MYK9-1365). No pulse on first mount.
  const entryTimestamp = (entry as Entry & { _timestamp?: number })._timestamp;
  const changeKey = `${displayStatus}|${entryTimestamp ?? ''}`;
  const [isAnimating, setIsAnimating] = React.useState(false);
  const prevChangeKeyRef = React.useRef(changeKey);

  React.useEffect(() => {
    if (prevChangeKeyRef.current === changeKey) return;
    prevChangeKeyRef.current = changeKey;
    setIsAnimating(true);
    const timer = setTimeout(() => setIsAnimating(false), 500);
    return () => clearTimeout(timer);
  }, [changeKey]);

  const pulseClass = isAnimating ? 'status-just-changed' : '';

  return (
    // A <button>, not a <div onClick>. This is the most-used steward control on
    // the surface and it had no role, no tabIndex and no key handler, so a
    // keyboard or switch-control user could not change a dog's check-in status
    // at all, and a screen reader announced it as static text.
    //
    // `aria-disabled` rather than the `disabled` attribute ON PURPOSE: when
    // self check-in is off, clicking is what opens the dialog EXPLAINING that
    // (handleStatusBadgeClick). A truly disabled button would swallow the click
    // and leave the steward with a greyed pill and no explanation.
    <button
      type="button"
      aria-disabled={isDisabled}
      aria-label={`Check-in: ${getCheckInPresentation(displayStatus).label}. ${isDisabled ? 'Self check-in disabled' : 'Change check-in'} for ${entry.callName}`}
      className={cn(
        // min-h-11 = 44px INTENT touch-target floor — stewards tap this
        // outdoors, often gloved; do not shrink it back for visual density.
        'relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-1.5 transition',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isDisabled
          ? 'cursor-not-allowed opacity-60'
          : 'cursor-pointer hover:bg-muted active:scale-95',
        pulseClass
      )}
      data-testid="check-in-button"
      onClick={onClick}
      onMouseDown={e => e.stopPropagation()}
      onTouchStart={e => e.stopPropagation()}
      title={isDisabled ? 'Self check-in disabled' : 'Change check-in'}
    >
      <CheckInIndicator status={displayStatus} inverse={inverse} />
    </button>
  );
};

/**
 * Queue-position pill for the exhibitor's own entries ("You're next",
 * "3 dogs ahead"). Persistent counterpart of the notification monitor's
 * transient "your turn" toast — same facts, glanceable on the list.
 * Renders nothing once the entry is scored (dogsAhead === null).
 */
export const OwnDogQueuePill: React.FC<{ dogsAhead: DogsAheadResult }> = ({ dogsAhead }) => {
  const label = formatDogsAheadInList(dogsAhead);
  if (label === null) return null;

  const emphasis =
    dogsAhead?.kind === 'in-ring' || (dogsAhead?.kind === 'waiting' && dogsAhead.dogsAhead === 0);

  return (
    <span
      data-testid="own-dog-queue-pill"
      className={cn(
        'whitespace-nowrap text-sm font-bold text-primary',
        emphasis && 'rounded-full bg-primary px-2 py-0.5 text-primary-foreground'
      )}
    >
      {label}
    </span>
  );
};

/**
 * Ring-conflict chip for the exhibitor's own entries. Informational only —
 * marking `check_in_status='conflict'` stays a human action via the status
 * dialog. Amber, calm, no animation.
 */
export const OwnDogConflictChip: React.FC<{ label: string }> = ({ label }) => (
  <span
    data-testid="own-dog-conflict-chip"
    className="inline-flex items-center gap-1 rounded-full border border-solid border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400"
  >
    {label}
  </span>
);

/**
 * Reset button for scored entries
 */
interface ResetButtonProps {
  onClick: (e: React.MouseEvent) => void;
  /** Named so the control is distinguishable in a list of identical glyphs. */
  callName: string;
}

export const ResetButton: React.FC<ResetButtonProps> = ({ onClick, callName }) => (
  <button
    // The label used to be "More options" while the tooltip said "Reset score" —
    // the announced name and the visible hint disagreed about what the control
    // does, on a button whose only visible content is "⋯". It also had no
    // focus-visible treatment, unlike the primary action beside it.
    className="reset-menu-button inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border-0 bg-muted px-3 text-2xl font-bold leading-none text-muted-foreground shadow-sm transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:scale-95 sm:min-h-12 sm:min-w-12"
    data-testid="reset-menu-button"
    onClick={onClick}
    onMouseDown={e => e.stopPropagation()}
    aria-label={`Score options for ${callName}`}
    title="Score options"
  >
    <span aria-hidden="true">⋯</span>
  </button>
);
