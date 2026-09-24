import { useSyncExternalStore } from 'react';
import { onlineManager } from '@tanstack/react-query';

/**
 * Why report data cannot be described by `isLoading` / `isError` alone.
 *
 * - `loading`     -- no settled rows yet, and a read is in flight or queued.
 * - `unavailable` -- no settled rows, and the read is PAUSED waiting for a
 *                    network it does not have. Distinct from an empty answer,
 *                    and the distinction is the whole point: an empty answer
 *                    prints as a blank roster.
 * - `stale`       -- rows are present but belong to the PREVIOUS selection
 *                    (React Query placeholder data).
 * - `refreshing`  -- settled rows are present, but a read is re-asking the
 *                    question ONLINE, usually because a mutation or a sync just
 *                    changed the rows. The printed paper would be the old answer.
 * - `error`       -- the read was made and failed, or the scope is invalid.
 * - `ready`       -- every row is present, current, and not being replaced.
 */
export type ReportDataState =
  'loading' | 'unavailable' | 'stale' | 'refreshing' | 'error' | 'ready';

/** The slice of one React Query result that readiness depends on. */
export interface ReadinessQuery {
  /** Settled rows exist for the CURRENT key (placeholder rows count as present). */
  hasData: boolean;
  isPlaceholderData: boolean;
  fetchStatus: 'fetching' | 'paused' | 'idle';
  /** A failure the caller has decided blocks the report. */
  isError: boolean;
}

export interface ReportReadinessContext {
  /** React Query's view of connectivity (`onlineManager`). */
  isOnline: boolean;
  /** The selected trial/class is not part of this show. */
  hasInvalidScope?: boolean;
}

/**
 * THE readiness rule for every report on the Reports page: Print, the preview
 * frame, the official PDF downloads and the emergency packet all read the state
 * this returns, so none of them can disagree about whether the paper is safe.
 *
 * Evaluated top to bottom; the first matching row wins.
 *
 * | # | Condition                                              | State         | Print   |
 * |---|--------------------------------------------------------|---------------|---------|
 * | 1 | the selected trial/class is not in this show            | `error`       | blocked |
 * | 2 | any read failed                                         | `error`       | blocked |
 * | 3 | any rows are placeholders from the previous selection   | `stale`       | blocked |
 * | 4 | any read has no settled rows and is paused (offline)    | `unavailable` | blocked |
 * | 5 | any read has no settled rows (pending / fetching)       | `loading`     | blocked |
 * | 6 | all rows settled, a read is fetching while ONLINE       | `refreshing`  | blocked |
 * | 7 | all rows settled (idle, paused, or fetching offline)    | `ready`       | allowed |
 *
 * Row 6 vs row 7 is the offline-first distinction. Online, a refetch means the
 * rows are being replaced by a newer answer (a mutation or sync just landed),
 * so printing now would put the previous answer on paper. Offline, a paused
 * refetch cannot replace anything and a replica re-read returns what the device
 * already holds: the cached report IS the best answer available, and taking it
 * away would strand a secretary in a hall whose wifi just dropped.
 */
export function resolveReportReadiness(
  queries: readonly ReadinessQuery[],
  { isOnline, hasInvalidScope = false }: ReportReadinessContext
): ReportDataState {
  if (hasInvalidScope) return 'error';
  if (queries.some(query => query.isError)) return 'error';
  if (queries.some(query => query.isPlaceholderData)) return 'stale';
  const unsettled = queries.filter(query => !query.hasData);
  if (unsettled.length > 0) {
    return unsettled.some(query => query.fetchStatus === 'paused') ? 'unavailable' : 'loading';
  }
  if (isOnline && queries.some(query => query.fetchStatus === 'fetching')) return 'refreshing';
  return 'ready';
}

/** Adapt a React Query result. `hasData` defaults to "the query holds data". */
export function readinessOf(
  query: {
    data: unknown;
    isPlaceholderData: boolean;
    fetchStatus: 'fetching' | 'paused' | 'idle';
    isError: boolean;
  },
  overrides: Partial<ReadinessQuery> = {}
): ReadinessQuery {
  return {
    hasData: query.data !== undefined,
    isPlaceholderData: query.isPlaceholderData,
    fetchStatus: query.fetchStatus,
    isError: query.isError,
    ...overrides,
  };
}

/**
 * Most blocking first. Combining two resolved states this way gives the same
 * answer as resolving their queries together, because the rule table above is
 * itself ordered by this precedence.
 */
const PRECEDENCE: readonly ReportDataState[] = [
  'error',
  'stale',
  'unavailable',
  'loading',
  'refreshing',
  'ready',
];

export function mostBlockingState(...states: ReportDataState[]): ReportDataState {
  return PRECEDENCE.find(state => states.includes(state)) ?? 'ready';
}

function subscribeOnline(onChange: () => void): () => void {
  return onlineManager.subscribe(() => onChange());
}

function readOnline(): boolean {
  return onlineManager.isOnline();
}

/** React Query's connectivity, as a render input, so readiness re-derives on change. */
export function useIsOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, readOnline, readOnline);
}
