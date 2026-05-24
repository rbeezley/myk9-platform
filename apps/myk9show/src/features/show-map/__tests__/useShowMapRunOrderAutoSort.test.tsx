/**
 * Hook-level tests for useShowMapRunOrderAutoSort.
 *
 * Focus: the Undo path must restore entries whose prior run_order was null
 * by writing runOrder=undefined (so the replication layer clears the
 * server-side column). The earlier implementation filtered null priors out
 * of the undo assignments, leaving the auto-sort-assigned numbers in place
 * — a silent contract bug reported in post-merge review of PR #319.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/utils/testUtils';
import { useShowMapRunOrderAutoSort } from '../useShowMapRunOrderAutoSort';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';

const { getEntriesByClassMock, updateEntryMock } = vi.hoisted(() => ({
  getEntriesByClassMock: vi.fn<(classId: string) => Promise<ReplicatedEntry[]>>(),
  updateEntryMock:
    vi.fn<(id: string, updates: Partial<ReplicatedEntry>) => Promise<string | null>>(),
}));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    getEntriesByClass: getEntriesByClassMock,
    updateEntry: updateEntryMock,
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

function entry(overrides: Partial<ReplicatedEntry>): ReplicatedEntry {
  return {
    id: overrides.id ?? 'e',
    armband: overrides.armband ?? '0',
    runOrder: overrides.runOrder,
    isScored: overrides.isScored,
    ...overrides,
  } as ReplicatedEntry;
}

function makeWrapper() {
  const client = createTestQueryClient();
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  getEntriesByClassMock.mockReset();
  updateEntryMock.mockReset();
  updateEntryMock.mockResolvedValue('mutation-id');
});

describe('useShowMapRunOrderAutoSort — Undo handles null priors', () => {
  it('writes runOrder=undefined for entries whose prior run_order was null', async () => {
    // Setup: one entry with a real run_order, one with null.
    getEntriesByClassMock.mockResolvedValue([
      entry({ id: 'a', armband: '10', runOrder: 1 }),
      entry({ id: 'b', armband: '20', runOrder: null as unknown as undefined }),
    ]);

    const { result } = renderHook(
      () => useShowMapRunOrderAutoSort({ showId: 'show-1' }),
      { wrapper: makeWrapper() }
    );

    // Trigger the auto-sort. Wait for completion.
    act(() => {
      result.current.autoSort({
        classId: 'class-1',
        kind: 'armband-asc',
        classLabel: 'Container Novice',
      });
    });
    await waitFor(() => expect(result.current.lastAutoSort).not.toBeNull());

    updateEntryMock.mockClear();

    // Now Undo. The prior snapshot has b's runOrder = null. The Undo path
    // must call updateEntry for b with runOrder=undefined so the server
    // column gets cleared back to null.
    act(() => result.current.undoLastAutoSort());

    await waitFor(() => expect(updateEntryMock).toHaveBeenCalled());

    const calls = updateEntryMock.mock.calls.map(([id, updates]) => ({ id, updates }));
    expect(calls).toEqual(
      expect.arrayContaining([
        { id: 'a', updates: { runOrder: 1 } },
        { id: 'b', updates: { runOrder: undefined } },
      ])
    );
  });
});
