export interface EntryCountState {
  status: 'loading' | 'unavailable' | 'ready';
  count: number;
}

export const hasCurrentEntryCounts = (entryCountState: EntryCountState): boolean =>
  entryCountState.status === 'ready' && entryCountState.count > 0;
