import { describe, it, expect } from 'vitest';
import { getQualificationsReadState } from './qualificationsReadState';

describe('getQualificationsReadState', () => {
  it('is loading while the first read is in flight', () => {
    expect(
      getQualificationsReadState({ hasList: false, isError: false, fetchStatus: 'fetching' })
    ).toBe('loading');
  });

  it('is unavailable, not empty, when the read is paused offline with nothing cached', () => {
    expect(
      getQualificationsReadState({ hasList: false, isError: false, fetchStatus: 'paused' })
    ).toBe('unavailable');
  });

  it('is unavailable when the first read failed', () => {
    expect(getQualificationsReadState({ hasList: false, isError: true, fetchStatus: 'idle' })).toBe(
      'unavailable'
    );
  });

  it('is stale when a refresh failed after a good read', () => {
    expect(getQualificationsReadState({ hasList: true, isError: true, fetchStatus: 'idle' })).toBe(
      'stale'
    );
  });

  it('is ready after a confirmed read, even while paused', () => {
    expect(
      getQualificationsReadState({ hasList: true, isError: false, fetchStatus: 'paused' })
    ).toBe('ready');
  });
});
