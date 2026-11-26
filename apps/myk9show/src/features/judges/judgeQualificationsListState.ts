import type { FetchStatus } from '@tanstack/react-query';

/**
 * MYK9-2394: what a screen knows about a person's judge qualifications. A list is only "empty"
 * after a read confirmed it; a paused (offline) or failed read with nothing cached is unknown.
 */
export type JudgeQualificationsListState =
  | { kind: 'loading'; offline: boolean }
  | { kind: 'error' }
  | { kind: 'loaded'; refreshFailed: boolean };

interface ListQuery {
  /** True once any read has returned a list, even if a later refresh failed. */
  hasData: boolean;
  isError: boolean;
  fetchStatus: FetchStatus;
}

export function getJudgeQualificationsListState(query: ListQuery): JudgeQualificationsListState {
  if (query.hasData) return { kind: 'loaded', refreshFailed: query.isError };
  if (query.isError) return { kind: 'error' };
  return { kind: 'loading', offline: query.fetchStatus === 'paused' };
}

/** Save replaces the whole list (MYK9-2382), so editing needs a list the latest read confirmed. */
export function canEditJudgeQualificationsList(state: JudgeQualificationsListState): boolean {
  return state.kind === 'loaded' && !state.refreshFailed;
}
