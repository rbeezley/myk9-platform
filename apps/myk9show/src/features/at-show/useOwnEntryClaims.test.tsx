/**
 * MYK9-1970: how the entry list's own dogs read their place. The server's answer wins when there
 * is one; with none (offline) a class the replica holds as paper still says paper.
 */
import type { ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { QueuePlaces } from '@/hooks/queries/useMyEntryQueuePlaces';
import { queuePlaces } from '@/test/utils/queuePlaces';

const mocks = vi.hoisted(() => ({
  places: new Map() as QueuePlaces,
  usesDeviceScoring: true as boolean | undefined,
  classes: {} as Record<string, { id: string; scoresOnPaper?: boolean | null }>,
}));

vi.mock('@/hooks/queries/useMyEntryQueuePlaces', () => ({
  useMyEntryQueuePlaces: () => mocks.places,
}));
vi.mock('@/services/replication', () => ({
  replicatedShowsTable: {
    getShowById: async () => ({ id: 'show-1', usesDeviceScoring: mocks.usesDeviceScoring }),
  },
  replicatedClassesTable: { getClassById: async (id: string) => mocks.classes[id] ?? null },
}));

import { useOwnEntryClaims } from './useOwnEntryClaims';

const entries = [
  { id: 'e-paper', classId: 'c-paper' },
  { id: 'e-live', classId: 'c-live' },
  { id: 'e-other', classId: 'c-paper' },
];
const own = new Set(['e-paper', 'e-live']);

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useOwnEntryClaims', () => {
  beforeEach(() => {
    mocks.places = new Map();
    mocks.usesDeviceScoring = true;
    mocks.classes = {
      'c-paper': { id: 'c-paper', scoresOnPaper: true },
      'c-live': { id: 'c-live', scoresOnPaper: null },
    };
  });

  it('says paper offline for a class the replica holds as paper, and nothing for a live one', async () => {
    const { result } = renderHook(() => useOwnEntryClaims('show-1', entries, own), { wrapper });
    await waitFor(() => expect(result.current.get('e-paper')).toBe('paper'));
    expect(result.current.has('e-live')).toBe(false);
    // Only the account's own entries are annotated.
    expect(result.current.has('e-other')).toBe(false);
  });

  it("reads the show's device-scoring switch for a class with no flag of its own", async () => {
    mocks.usesDeviceScoring = false;
    const { result } = renderHook(() => useOwnEntryClaims('show-1', entries, own), { wrapper });
    await waitFor(() => expect(result.current.get('e-live')).toBe('paper'));
  });

  it("lets the server's settled answer decide, stale included", async () => {
    mocks.places = queuePlaces([
      ['e-paper', 4, 'live'],
      ['e-live', 2, 'stale'],
    ]);
    const { result } = renderHook(() => useOwnEntryClaims('show-1', entries, own), { wrapper });
    await waitFor(() => expect(result.current.get('e-live')).toBe('stale'));
    expect(result.current.get('e-paper')).toBe('live');
  });
});
