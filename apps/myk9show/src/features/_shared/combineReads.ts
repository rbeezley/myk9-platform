/**
 * ONE answer to "what do these reads add up to?" for a surface that stands on several of them
 * (MYK9-1031). Each sub-read reports the same four facts, and this pure function folds them, so a
 * surface cannot invent its own rule per read and leave one failure silent (LESSONS: disabled,
 * paused and placeholder reads all look like "nothing").
 *
 *  - a CRITICAL read (the surface is meaningless without it) with an error and no data is
 *    `failed`; still loading is `loading`; settled with no data and no error (paused offline,
 *    disabled) is `unavailable`;
 *  - any read with an error and no data, critical or not, is listed in `unavailableKeys`, so the
 *    parts that depend on it say so instead of going missing;
 *  - an error alongside data is a failed background refresh: keep the data, set `refreshFailed`.
 */
export interface ReadStatus {
  key: string;
  /** The surface cannot render at all without this read. */
  critical: boolean;
  /** Data (possibly cached) is in hand. */
  hasData: boolean;
  isLoading: boolean;
  isError: boolean;
}

export type CombinedReadState = 'loading' | 'ready' | 'failed' | 'unavailable';

export interface CombinedReads {
  state: CombinedReadState;
  unavailableKeys: readonly string[];
  refreshFailed: boolean;
}

export function combineReads(reads: readonly ReadStatus[]): CombinedReads {
  const noData = reads.filter(read => !read.hasData);
  const unavailableKeys = noData.filter(read => !read.isLoading).map(read => read.key);
  const critical = noData.filter(read => read.critical);
  const state: CombinedReadState = critical.some(read => read.isError)
    ? 'failed'
    : critical.some(read => read.isLoading)
      ? 'loading'
      : critical.length > 0
        ? 'unavailable'
        : 'ready';
  return {
    state,
    unavailableKeys,
    refreshFailed: reads.some(read => read.hasData && read.isError),
  };
}
