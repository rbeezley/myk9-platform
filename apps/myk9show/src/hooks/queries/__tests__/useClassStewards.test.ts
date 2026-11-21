import { describe, expect, it } from 'vitest';
import { loadStatus } from '../useClassStewards';

const query = (overrides: Partial<Parameters<typeof loadStatus>[0]>) => ({
  data: undefined,
  isError: false,
  isPending: true,
  fetchStatus: 'fetching',
  ...overrides,
});

describe('loadStatus (MYK9-2328)', () => {
  it('is loading while the first fetch runs', () => {
    expect(loadStatus(query({}))).toBe('loading');
  });

  it('is unavailable, not loading forever, when the device is offline', () => {
    expect(loadStatus(query({ fetchStatus: 'paused' }))).toBe('unavailable');
  });

  it('is unavailable when the fetch failed with nothing cached', () => {
    expect(loadStatus(query({ isError: true, isPending: false, fetchStatus: 'idle' }))).toBe(
      'unavailable'
    );
  });

  it('keeps cached data shown when a refresh fails', () => {
    expect(loadStatus(query({ data: [], isError: true, fetchStatus: 'idle' }))).toBe('ready');
  });
});
