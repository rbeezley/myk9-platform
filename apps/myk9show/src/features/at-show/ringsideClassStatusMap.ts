/**
 * ringside ↔ myK9Show class-status mapping.
 *
 * ringside's class-status vocabulary is richer than myK9Show's DB CHECK
 * constraint:
 *   ringside: no-status | setup | briefing | break | start_time |
 *             in_progress | offline-scoring | completed
 *   myK9Show: setup | in_progress | completed | cancelled | upcoming
 *
 * INTENT (owner decision 2026-10-29, MYK9-1513): the class status stays as it
 * is. Briefing, Break and Offline Scoring are a separate nullable RING PHASE
 * (`classes.ring_phase`) that only means something while the class is
 * `in_progress`; Briefing and Break also carry a phase time (`ring_phase_time`).
 * v3's Start Time is the existing Expected start (`revised_expected_start`), not
 * a status. The dialog sets status and phase together, and the card reads them
 * back as the same eight values, so nothing collapses.
 */

import type { ClassStatusUpdateFields, ClassStatusValue } from '@myk9/ringside';

/** myK9Show class-status values its `mapClassStatusToDb` accepts (canonical lowercase). */
export type ShowClassStatus = 'setup' | 'in_progress' | 'completed' | 'cancelled' | 'upcoming';

/** `classes.ring_phase` values. */
export type RingPhase = 'briefing' | 'break' | 'offline_scoring';

/** The class status and ring phase one ringside status stands for. */
export interface ShowClassStatusWrite {
  classStatus: ShowClassStatus;
  ringPhase: RingPhase | null;
}

export function toShowClassStatusWrite(ringsideStatus: ClassStatusValue): ShowClassStatusWrite {
  switch (ringsideStatus) {
    case 'setup':
      return { classStatus: 'setup', ringPhase: null };
    case 'briefing':
      return { classStatus: 'in_progress', ringPhase: 'briefing' };
    case 'break':
      return { classStatus: 'in_progress', ringPhase: 'break' };
    case 'offline-scoring':
      return { classStatus: 'in_progress', ringPhase: 'offline_scoring' };
    case 'in_progress':
      return { classStatus: 'in_progress', ringPhase: null };
    case 'completed':
      return { classStatus: 'completed', ringPhase: null };
    // Start Time announces when an unstarted class will begin; it is the
    // Expected start on a class with no status, so the status side is upcoming.
    case 'start_time':
    case 'no-status':
      return { classStatus: 'upcoming', ringPhase: null };
    default:
      // Exhaustiveness guard — a new ringside status fails to compile here
      // (the arg is `never` only if every case above is handled).
      return ((_: never): ShowClassStatusWrite => ({ classStatus: 'upcoming', ringPhase: null }))(
        ringsideStatus
      );
  }
}

/**
 * The time the status dialog collected, as the `ClassStatusUpdateFields` key the
 * status owns: Briefing's time, Break's "until" time, Start Time's time. Statuses
 * without a time (and a blank time) yield nothing.
 */
export function toStatusUpdateFields(
  status: ClassStatusValue,
  timeValue: string | undefined
): ClassStatusUpdateFields | undefined {
  if (!timeValue) return undefined;
  switch (status) {
    case 'briefing':
      return { briefing_time: timeValue };
    case 'break':
      return { break_until: timeValue };
    case 'start_time':
      return { start_time: timeValue };
    default:
      return undefined;
  }
}

/** myK9Show class status → the status half of the write, for callers that need only that. */
export function toShowClassStatus(ringsideStatus: ClassStatusValue): ShowClassStatus {
  return toShowClassStatusWrite(ringsideStatus).classStatus;
}

/** The slice of a replicated class the display mapping reads. */
export interface RingsideStatusSource {
  classStatus?: string | undefined;
  ringPhase?: string | null | undefined;
  revisedExpectedStart?: string | null | undefined;
}

/**
 * Inverse: a class's stored status + ring phase + Expected start → ringside
 * `ClassStatusValue`, for DISPLAY (the class card and the status dialog).
 *
 * A ring phase counts only while the class is `in_progress`. An unstarted class
 * (`upcoming`, or any other not-started spelling) with an Expected start reads as
 * `start_time`; `cancelled` has no ringside equivalent and reads as `no-status`.
 */
export function toRingsideClassStatus(
  source: RingsideStatusSource | string | undefined
): ClassStatusValue {
  const { classStatus, ringPhase, revisedExpectedStart } =
    typeof source === 'object'
      ? source
      : { classStatus: source, ringPhase: null, revisedExpectedStart: null };
  switch (classStatus?.toLowerCase().replace(/[\s-]+/g, '_')) {
    case 'setup':
      return 'setup';
    case 'in_progress':
      if (ringPhase === 'briefing') return 'briefing';
      if (ringPhase === 'break') return 'break';
      if (ringPhase === 'offline_scoring') return 'offline-scoring';
      return 'in_progress';
    case 'completed':
      return 'completed';
    case 'cancelled':
      return 'no-status';
    default:
      return revisedExpectedStart ? 'start_time' : 'no-status';
  }
}
