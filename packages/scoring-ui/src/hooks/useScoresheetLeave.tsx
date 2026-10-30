/**
 * Leaving a scoresheet (MYK9-1500): Up and the bottom Cancel call `onBack`
 * directly. The sheet only reports whether leaving would lose work (a run timer,
 * a chosen result, a typed time or any edited score field) through
 * `onDirtyChange`; the host's route guard owns the single "Discard this score?"
 * prompt, so Up, Cancel and the back gesture are all held to it.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { RingsideUpButton } from '@myk9/ui';
import type { ScoresheetScoringReturn } from './useScoresheetScoring';

interface StopwatchLike {
  isRunning: boolean;
  getTimeMs: () => number;
}

export interface UseScoresheetLeaveOptions {
  scoring: ScoresheetScoringReturn;
  /** Omit for sheets without a run timer. */
  stopwatch?: StopwatchLike;
  /** Sport-specific result input the shared scoring state does not hold. */
  extraDirty?: () => boolean;
  onBack: () => void;
  /** The parent screen's name on the Up control; "Entries" when omitted. */
  backLabel?: string | undefined;
  /**
   * Tells the host whether leaving would lose work, so its route guard can hold
   * every way out (Up, Cancel, the back gesture) to one prompt.
   */
  onDirtyChange?: ((dirty: boolean) => void) | undefined;
}

/** Everything the sheet persists, in one comparable string. */
function scoreSnapshot(scoring: ScoresheetScoringReturn): string {
  return JSON.stringify([
    scoring.qualifying,
    scoring.nonQualifyingReason,
    scoring.faultCount,
    scoring.areas,
  ]);
}

export function useScoresheetLeave({
  scoring,
  stopwatch,
  extraDirty,
  onBack,
  backLabel,
  onDirtyChange,
}: UseScoresheetLeaveOptions): { upButton: ReactNode } {
  // What the sheet opened with, so re-editing a saved score is not "dirty" until changed.
  const [initial] = useState(() => scoreSnapshot(scoring));

  // Read when asked (the stopwatch time lives in a ref and does not re-render).
  const isDirty = () =>
    Boolean(stopwatch && (stopwatch.isRunning || stopwatch.getTimeMs() > 0)) ||
    scoreSnapshot(scoring) !== initial ||
    Boolean(extraDirty?.());
  const dirty = isDirty();

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  // A sheet that unmounts (saved, or replaced by an error screen) holds nothing.
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const upButton = <RingsideUpButton label={backLabel ?? 'Entries'} onClick={onBack} />;

  return { upButton };
}
