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

/** Completed only when both are; in progress if either is; else the earlier state. */
export function mergeSectionStatus(a: ClassStatusValue, b: ClassStatusValue): ClassStatusValue {
  if (a === 'completed' && b === 'completed') return 'completed';
  if (a === 'in_progress' || b === 'in_progress') return 'in_progress';
  if (a === 'offline-scoring' || b === 'offline-scoring') return 'offline-scoring';
  return PRE_SCORING_RANK[a] <= PRE_SCORING_RANK[b] ? a : b;
}

const earlier = (a?: string, b?: string) => (a && b ? (a < b ? a : b) : (a ?? b));
const later = (a?: string, b?: string) => (a && b ? (a > b ? a : b) : (a ?? b));

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
 * Section A's card with status, finalization, release and times replaced by
 * the merged state of the pair. A time the merge drops (an end only one
 * section has) is removed rather than inherited from A.
 */
export function withMergedSectionState(first: ClassEntry, second: ClassEntry): ClassEntry {
  const base: ClassEntry = { ...first };
  for (const key of MERGED_TIME_KEYS) delete base[key];
  const bothReleased = first.results_released_at && second.results_released_at;
  return {
    ...base,
    class_status: mergeSectionStatus(first.class_status, second.class_status),
    is_scoring_finalized: Boolean(first.is_scoring_finalized && second.is_scoring_finalized),
    results_released_at: bothReleased
      ? (later(first.results_released_at ?? undefined, second.results_released_at ?? undefined) ??
        null)
      : null,
    ...timeFields(first, second),
  };
}
