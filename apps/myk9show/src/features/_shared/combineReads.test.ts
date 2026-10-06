import { describe, expect, it } from 'vitest';
import { combineReads, type ReadStatus } from './combineReads';

const read = (key: string, overrides: Partial<ReadStatus> = {}): ReadStatus => ({
  key,
  critical: true,
  hasData: true,
  isLoading: false,
  isError: false,
  ...overrides,
});

describe('combineReads', () => {
  it('is ready when every read has data', () => {
    expect(combineReads([read('a'), read('b')])).toEqual({
      state: 'ready',
      unavailableKeys: [],
      refreshFailed: false,
    });
  });

  it('is loading while a critical read has no data and is in flight', () => {
    expect(combineReads([read('a'), read('b', { hasData: false, isLoading: true })]).state).toBe(
      'loading'
    );
  });

  it('is failed when a critical read errored with nothing cached, even if another is loading', () => {
    const result = combineReads([
      read('a', { hasData: false, isError: true }),
      read('b', { hasData: false, isLoading: true }),
    ]);
    expect(result.state).toBe('failed');
    expect(result.unavailableKeys).toEqual(['a']);
  });

  it('is unavailable (not empty) for a critical read that settled with no data and no error', () => {
    const result = combineReads([read('a', { hasData: false })]);
    expect(result.state).toBe('unavailable');
    expect(result.unavailableKeys).toEqual(['a']);
  });

  it('keeps ready and names a non-critical read that failed with no data', () => {
    const result = combineReads([
      read('a'),
      read('facts', { critical: false, hasData: false, isError: true }),
    ]);
    expect(result).toEqual({ state: 'ready', unavailableKeys: ['facts'], refreshFailed: false });
  });

  it('keeps the data and flags a failed refresh when an errored read still has data', () => {
    const result = combineReads([read('a', { isError: true }), read('b')]);
    expect(result).toEqual({ state: 'ready', unavailableKeys: [], refreshFailed: true });
  });
});
