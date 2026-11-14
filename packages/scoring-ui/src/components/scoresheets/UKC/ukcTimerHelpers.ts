/** Timer helpers for the UKC Nosework sheet: which clock carries the max, and what it reports. */
import type { ElementMaxTimeStatus } from '../../../hooks/useElementMaxTimeStatus';
import type { ResolvedClassRules, StopwatchReturn } from '../../../types';

/**
 * Which clock carries the max. The rulebook maximum is an ELEMENT time
 * (MYK9-1093): single mode has one clock, so it carries the max; in dual mode
 * the element clock does, and the search clock (which pauses at each alert)
 * has none of its own.
 */
export function splitMaxTime(isDual: boolean, rules: ResolvedClassRules, maxTimeStr: string) {
  const maxTimeMs = rules.maxTimeSeconds * 1000;
  return {
    maxTimeMs,
    searchMaxTime: isDual ? undefined : maxTimeStr,
    // Undefined = no element limit: single mode, or a class with none (0).
    elementMaxTimeMs: isDual && maxTimeMs > 0 ? maxTimeMs : undefined,
  };
}

/**
 * A dual-mode search time as recorded: never past the element max, which a late
 * tick (locked phone) or a Finish just past the max would otherwise allow. No
 * element max, no cap -- a class without a limit records the real time.
 */
export function capAtElementMax(searchMs: number, elementMaxTimeMs: number | undefined): number {
  return elementMaxTimeMs === undefined ? searchMs : Math.min(searchMs, elementMaxTimeMs);
}

/** Warning / expiry / remaining time from whichever clock carries the max. */
export function timerStatus(
  isDual: boolean,
  element: ElementMaxTimeStatus,
  stopwatch: StopwatchReturn
) {
  return isDual
    ? {
        warningMessage: element.warningMessage,
        // The search digits stay neutral: the paused search clock is not the one
        // running out -- the ring and banner carry the element warning.
        isWarning: false,
        isExpired: false,
      }
    : {
        warningMessage: stopwatch.getWarningMessage(),
        isWarning: stopwatch.shouldShow30SecondWarning(),
        isExpired: stopwatch.isTimeExpired(),
      };
}
