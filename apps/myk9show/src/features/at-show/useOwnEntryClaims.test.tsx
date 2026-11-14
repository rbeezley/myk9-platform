import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { Entry } from '@myk9/ringside';
import { useOwnEntryClaims } from './useOwnEntryClaims';

// MYK9-1970: the entry list's own dogs read the server's claim state, and a class this device
// holds as paper reads paper with no server at all.

const mocks = vi.hoisted(() => ({
  places: new Map<string, { place: number; claimState: 'live' | 'paper' | 'stale' }>(),
  data: undefined as
    | {
        classes: { classId: string; scoresOnPaper: boolean | null }[];
        usesDeviceScoring: boolean | undefined;
      }
    | undefined,
}));

vi.mock('@/hooks/queries/useMyEntryQueuePlaces', () => ({
  useMyEntryQueuePlaces: () => mocks.places,
}));
vi.mock('./useShowRingRows', () => ({
  useShowRingRows: () => ({ data: mocks.data }),
}));

const entries = [
  { id: 'a', classId: 'paper-class' },
  { id: 'b', classId: 'live-class' },
  { id: 'c', classId: 'live-class' },
] as unknown as Entry[];

describe('useOwnEntryClaims', () => {
  beforeEach(() => {
    mocks.places = new Map();
    mocks.data = {
      classes: [
        { classId: 'paper-class', scoresOnPaper: true },
        { classId: 'live-class', scoresOnPaper: null },
      ],
      usesDeviceScoring: true,
    };
  });

  it('reads paper from the class this device holds when the server has not answered', async () => {
    const { result } = renderHook(() => useOwnEntryClaims('show-1', new Set(['a', 'b']), entries));
    await waitFor(() => expect(result.current.get('a')).toBe('paper'));
    // No claim and no paper fact: never a live count.
    expect(result.current.get('b')).toBe('stale');
  });

  it('reads paper for a class that follows a show whose switch says paper, with no claim', () => {
    mocks.data = {
      classes: [{ classId: 'live-class', scoresOnPaper: null }],
      usesDeviceScoring: false,
    };
    const { result } = renderHook(() => useOwnEntryClaims('show-1', new Set(['b']), entries));
    expect(result.current.get('b')).toBe('paper');
  });

  it('is stale, never live, while the rows load or the read failed', () => {
    mocks.data = undefined;
    const { result } = renderHook(() => useOwnEntryClaims('show-1', new Set(['b']), entries));
    expect(result.current.get('b')).toBe('stale');
  });

  it('lets the server answer win, and ignores entries the account does not own', async () => {
    mocks.places = new Map([
      ['a', { place: 4, claimState: 'live' }],
      ['b', { place: 2, claimState: 'stale' }],
    ]);
    const { result } = renderHook(() => useOwnEntryClaims('show-1', new Set(['a', 'b']), entries));
    await waitFor(() => expect(result.current.get('a')).toBe('live'));
    expect(result.current.get('b')).toBe('stale');
    expect(result.current.has('c')).toBe(false);
  });

  it('gives an account with no entries no claims', async () => {
    const { result } = renderHook(() => useOwnEntryClaims('show-1', new Set(), entries));
    expect(result.current.size).toBe(0);
  });
});
