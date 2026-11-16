import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMyAtShowEntryDetails } from './useMyAtShowEntryDetails';
import { replicatedEntriesTable, replicatedShowsTable } from '@/services/replication';
import type { AtShowClassSummary, AtShowTrialSummary } from './myAtShowEntryDetails.helpers';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';

vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: {
    getEntriesByShow: vi.fn(),
    subscribe: vi.fn(),
  },
  replicatedShowsTable: { getShowById: vi.fn() },
}));

// The own-results read has its own test; keep this one about the replica subscription.
vi.mock('./useMyShowResults', () => ({ useMyShowResults: () => new Map() }));

const emptyClasses: ReadonlyMap<string, AtShowClassSummary> = new Map();
const emptyTrials: ReadonlyMap<string, AtShowTrialSummary> = new Map();

describe('useMyAtShowEntryDetails — reconciles via table subscription, not a specific mutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(replicatedShowsTable.getShowById).mockResolvedValue(null);
  });

  function wrapper({ children }: { children: React.ReactNode }) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  }

  it('subscribes to replicatedEntriesTable and refetches when the table changes — regardless of which surface wrote it', async () => {
    let subscribedCallback: ((data: ReplicatedEntry[]) => void) | undefined;
    vi.mocked(replicatedEntriesTable.subscribe).mockImplementation(cb => {
      subscribedCallback = cb;
      return vi.fn();
    });
    vi.mocked(replicatedEntriesTable.getEntriesByShow).mockResolvedValue([]);

    renderHook(
      () =>
        useMyAtShowEntryDetails('show-1', new Set(['entry-1']), false, emptyClasses, emptyTrials),
      { wrapper }
    );

    await waitFor(() => {
      expect(replicatedEntriesTable.getEntriesByShow).toHaveBeenCalledTimes(1);
    });
    expect(subscribedCallback).toBeDefined();

    // Simulate ANY write reaching the table (ringside entry-list page,
    // ClassResultsTable, replication sync of a self-checkin RPC — the
    // subscription doesn't care which).
    subscribedCallback?.([]);

    await waitFor(() => {
      expect(replicatedEntriesTable.getEntriesByShow).toHaveBeenCalledTimes(2);
    });
  });

  it('unsubscribes on unmount', () => {
    const unsubscribe = vi.fn();
    vi.mocked(replicatedEntriesTable.subscribe).mockReturnValue(unsubscribe);
    vi.mocked(replicatedEntriesTable.getEntriesByShow).mockResolvedValue([]);

    const { unmount } = renderHook(
      () =>
        useMyAtShowEntryDetails('show-1', new Set(['entry-1']), false, emptyClasses, emptyTrials),
      { wrapper }
    );

    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  describe('scored on paper, from the replicated rows only (MYK9-1970)', () => {
    const entry = {
      id: 'entry-1',
      classId: 'class-1',
      dogCallName: 'Rex',
      armband: '101',
      checkInStatus: 'checked-in',
      runOrder: 4,
      isScored: false,
    } as unknown as ReplicatedEntry;
    const classes = (scoresOnPaper: boolean | undefined) =>
      new Map<string, AtShowClassSummary>([
        [
          'class-1',
          {
            className: 'Container Novice',
            ...(scoresOnPaper === undefined ? {} : { scoresOnPaper }),
          } as AtShowClassSummary,
        ],
      ]);
    const detail = async (
      scoresOnPaper: boolean | undefined,
      usesDeviceScoring: boolean | undefined
    ) => {
      vi.mocked(replicatedEntriesTable.subscribe).mockReturnValue(vi.fn());
      vi.mocked(replicatedEntriesTable.getEntriesByShow).mockResolvedValue([entry]);
      vi.mocked(replicatedShowsTable.getShowById).mockResolvedValue(
        usesDeviceScoring === undefined
          ? null
          : ({ usesDeviceScoring } as unknown as Awaited<
              ReturnType<typeof replicatedShowsTable.getShowById>
            >)
      );
      const { result } = renderHook(
        () =>
          useMyAtShowEntryDetails(
            'show-1',
            new Set(['entry-1']),
            false,
            classes(scoresOnPaper),
            emptyTrials
          ),
        { wrapper }
      );
      await waitFor(() => expect(result.current.entries).toHaveLength(1));
      if (usesDeviceScoring !== undefined) {
        await waitFor(() =>
          expect(result.current.entries[0]?.scoresOnPaper).toBe(
            scoresOnPaper ?? usesDeviceScoring === false
          )
        );
      }
      return result.current.entries[0];
    };

    it('is paper from the class flag alone', async () => {
      expect((await detail(true, undefined))?.scoresOnPaper).toBe(true);
    });

    it('is paper from the show switch alone, for a class that follows the show', async () => {
      expect((await detail(undefined, false))?.scoresOnPaper).toBe(true);
    });

    it('is not paper for a phone class, a phone show, or nothing known', async () => {
      expect((await detail(false, false))?.scoresOnPaper).toBe(false);
      expect((await detail(undefined, true))?.scoresOnPaper).toBe(false);
      expect((await detail(undefined, undefined))?.scoresOnPaper).toBe(false);
    });
  });
});
