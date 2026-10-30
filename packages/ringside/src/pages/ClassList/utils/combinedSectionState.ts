/**
 * Merge the lifecycle state of an A/B pair into the one combined picker card.
 *
 * The card is built on Section A, so without this it would read A's status,
 * times and release. A and B run together but are scored and released
 * separately, so the pair is only as far along as its LEAST advanced section
 * (mirrors the combined entry-list's `classInfo`, which finalizes and
 * releases only when both sections have).
 */

import type { ClassEntry, ClassStatusValue } from '../types';
import { pickClassTime } from './classTimeValue';

/** Order of the lifecycle before a class is actively being scored. */
const PRE_SCORING_RANK: Record<ClassStatusValue, number> = {
  'no-status': 0,
  setup: 1,
  briefing: 2,
  break: 3,
  start_time: 4,
  'offline-scoring': 5,
  in_progress: 6,
  completed: 7,
};

/**
 * Offline scoring wins (the warning must survive). Otherwise in progress if
 * either section is, or if only one is completed (half the pair is scored).
 * Completed only when both are; else the earlier pre-scoring state.
 */
export function mergeSectionStatus(a: ClassStatusValue, b: ClassStatusValue): ClassStatusValue {
  if (a === 'offline-scoring' || b === 'offline-scoring') return 'offline-scoring';
  if (a === 'in_progress' || b === 'in_progress') return 'in_progress';
  if (a === 'completed' && b === 'completed') return 'completed';
  if (a === 'completed' || b === 'completed') return 'in_progress';
  return PRE_SCORING_RANK[a] <= PRE_SCORING_RANK[b] ? a : b;
}

/** The slice of a section the pair's ring phase is decided from. */
export type PhaseSource = Pick<
  ClassEntry,
  'class_status' | 'briefing_time' | 'break_until' | 'revised_expected_start'
>;

export interface MergedSectionPhase {
  status: ClassStatusValue;
  /** The phase's time in the spelling the sections hold it; absent when the phase carries none. */
  time?: string;
}

/**
 * The one decision of an A/B pair's ring phase and its time, read by the combined card
 * (`withMergedSectionState`) and the entry-list header alike.
 *
 * - The phase is `mergeSectionStatus` (Offline Scoring on either section wins).
 * - Only a section HOLDING the merged phase contributes a time; when neither does, no time.
 * - One holder: its time. Both: Start Time takes the earlier expected start instant, Briefing the
 *   EARLIER briefing time (exhibitors must be there for the first), Break the LATER break-until time
 *   (the ring is not back until both are).
 */
export function mergeSectionPhase(a: PhaseSource, b: PhaseSource): MergedSectionPhase {
  const status = mergeSectionStatus(a.class_status, b.class_status);
  const timeOf = (s: PhaseSource): string | undefined =>
    status === 'briefing'
      ? s.briefing_time
      : status === 'break'
        ? s.break_until
        : status === 'start_time'
          ? s.revised_expected_start
          : undefined;
  const aTime = a.class_status === status ? timeOf(a) : undefined;
  const bTime = b.class_status === status ? timeOf(b) : undefined;
  const time = pickClassTime(aTime, bTime, status === 'break' ? 'later' : 'earlier');
  return time ? { status, time } : { status };
}

const earlier = (a?: string, b?: string) => pickClassTime(a, b, 'earlier');
const later = (a?: string, b?: string) => pickClassTime(a, b, 'later');

type TimeKey =
  | 'planned_start_time'
  | 'start_time'
  | 'revised_expected_start'
  | 'actual_start_time'
  | 'last_result_at'
  | 'actual_end_time';

function timeFields(a: ClassEntry, b: ClassEntry): Partial<Record<TimeKey, string>> {
  const picked: Partial<Record<TimeKey, string | undefined>> = {
    planned_start_time: earlier(a.planned_start_time, b.planned_start_time),
    start_time: earlier(a.start_time, b.start_time),
    revised_expected_start: earlier(a.revised_expected_start, b.revised_expected_start),
    actual_start_time: earlier(a.actual_start_time, b.actual_start_time),
    last_result_at: later(a.last_result_at, b.last_result_at),
    // The pair has ended only once BOTH sections have.
    actual_end_time:
      a.actual_end_time && b.actual_end_time
        ? later(a.actual_end_time, b.actual_end_time)
        : undefined,
  };
  const out: Partial<Record<TimeKey, string>> = {};
  for (const key of Object.keys(picked) as TimeKey[]) {
    const value = picked[key];
    if (value) out[key] = value;
  }
  return out;
}

const MERGED_TIME_KEYS: TimeKey[] = [
  'planned_start_time',
  'start_time',
  'revised_expected_start',
  'actual_start_time',
  'last_result_at',
  'actual_end_time',
];

/**
 * Section A's card with status, ring-phase time, finalization, release and times replaced by
 * the merged state of the pair (`mergeSectionPhase` decides the phase and its time). A time the merge drops (an end only one
 * section has) is removed rather than inherited from A.
 */
export function withMergedSectionState(first: ClassEntry, second: ClassEntry): ClassEntry {
  const base: ClassEntry = { ...first };
  for (const key of MERGED_TIME_KEYS) delete base[key];
  delete base.briefing_time;
  delete base.break_until;
  const bothReleased = first.results_released_at && second.results_released_at;
  const phase = mergeSectionPhase(first, second);
  return {
    ...base,
    class_status: phase.status,
    ...(phase.time && phase.status === 'briefing' ? { briefing_time: phase.time } : {}),
    ...(phase.time && phase.status === 'break' ? { break_until: phase.time } : {}),
    is_scoring_finalized: Boolean(first.is_scoring_finalized && second.is_scoring_finalized),
    results_released_at: bothReleased
      ? (later(first.results_released_at ?? undefined, second.results_released_at ?? undefined) ??
        null)
      : null,
    ...timeFields(first, second),
  };
}
