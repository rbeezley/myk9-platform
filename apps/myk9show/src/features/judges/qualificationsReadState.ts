/**
 * MYK9-2394: what we know about a person's judge qualifications list.
 * - loading: a read is on its way
 * - unavailable: no list yet and the read failed, or it is paused (offline). We do not know.
 * - ready: a confirmed list, empty or not
 * - stale: a list loaded earlier, but the latest refresh failed. Readable, never editable.
 * "Empty" is only ever true in `ready`.
 */
export type QualificationsReadState = 'loading' | 'unavailable' | 'ready' | 'stale';

interface QualificationsQueryLike {
  hasList: boolean;
  isError: boolean;
  fetchStatus: 'fetching' | 'paused' | 'idle';
}

export function getQualificationsReadState(q: QualificationsQueryLike): QualificationsReadState {
  if (q.hasList) return q.isError ? 'stale' : 'ready';
  if (q.isError || q.fetchStatus === 'paused') return 'unavailable';
  return 'loading';
}
