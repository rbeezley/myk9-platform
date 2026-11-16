import { describe, expect, it } from 'vitest';

import { sentCheckAnswer } from '../useResultsSentCheck';

const map = new Map([['class-1', '2026-05-10T13:00:00Z']]);
const base = {
  since: '2026-05-10T12:00:00Z',
  ready: true,
  queueState: false as const,
  freshAfter: 100,
  isError: false,
  fetchStatus: 'idle' as const,
  data: map,
  dataUpdatedAt: 200,
};

describe('sentCheckAnswer (MYK9-2078 freshness rule)', () => {
  it('reads history fetched after the fresh-after mark', () => {
    expect(sentCheckAnswer(base)).toEqual({ status: 'read', latestByClass: map });
  });

  it('has no answer when nothing was sent', () => {
    expect(sentCheckAnswer({ ...base, since: null })).toBeUndefined();
  });

  it('is checking, not current, for history older than the mark while online', () => {
    expect(sentCheckAnswer({ ...base, dataUpdatedAt: 50, fetchStatus: 'fetching' })).toEqual({
      status: 'loading',
    });
  });

  it('could not check, not checking, for stale history while the re-read is paused offline', () => {
    expect(sentCheckAnswer({ ...base, dataUpdatedAt: 50, fetchStatus: 'paused' })).toEqual({
      status: 'unreadable',
    });
    expect(sentCheckAnswer({ ...base, data: undefined, fetchStatus: 'paused' })).toEqual({
      status: 'unreadable',
    });
  });

  it('never reads cached history before the first queue read sets a mark', () => {
    expect(sentCheckAnswer({ ...base, queueState: null, freshAfter: null })).toEqual({
      status: 'loading',
    });
    expect(sentCheckAnswer({ ...base, freshAfter: null })).toEqual({ status: 'loading' });
  });

  it('could not check while a change waits in the queue or the read failed', () => {
    expect(sentCheckAnswer({ ...base, queueState: true })).toEqual({ status: 'unreadable' });
    expect(sentCheckAnswer({ ...base, queueState: 'error' })).toEqual({ status: 'unreadable' });
    expect(sentCheckAnswer({ ...base, isError: true })).toEqual({ status: 'unreadable' });
  });

  it('is checking until the schedule is ready', () => {
    expect(sentCheckAnswer({ ...base, ready: false })).toEqual({ status: 'loading' });
  });
});
