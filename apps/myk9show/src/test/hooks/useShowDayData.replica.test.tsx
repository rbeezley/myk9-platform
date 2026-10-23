/**
 * MYK9-1368: useShowDayData reads the replica, so it refreshes when the entries
 * replica changes (coalesced) and keeps one slow timer for the date roll. It no
 * longer scans IndexedDB every 30 s on every signed-in device.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/utils/testUtils';
import {
  SHOW_DAY_DATE_ROLL_MS,
  SHOW_DAY_REPLICA_COALESCE_MS,
  useShowDayData,
} from '@/hooks/queries/useShowDayData';
import type { ShowDayCheckRow, ShowDayDetailRow } from '@/types/show-day-types';

const mocks = vi.hoisted(() => ({
  check: vi.fn(),
  details: vi.fn(),
  progress: vi.fn(),
  listeners: new Set<() => void>(),
  subscribe: vi.fn(),
}));

vi.mock('@/hooks/queries/showDayDataReplication', () => ({
  fetchReplicatedShowDayCheck: (...args: unknown[]) => mocks.check(...args),
  fetchReplicatedShowDayDetails: (...args: unknown[]) => mocks.details(...args),
  fetchReplicatedRingProgress: (...args: unknown[]) => mocks.progress(...args),
}));
vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: { subscribe: (...args: unknown[]) => mocks.subscribe(...args) },
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ userWithRoles: { databaseUserId: 'user-1' } }),
}));

function checkRow(date: string): ShowDayCheckRow {
  return {
    id: 'entry-1',
    trial: {
      id: 'trial-1',
      date,
      show: {
        id: 'show-1',
        name: 'Trial',
        location: '',
        status: 'in_progress',
        start_date: date,
        end_date: date,
        club: { name: 'Club' },
      },
    },
  };
}

const detailRow = {
  id: 'entry-1',
  check_in_status: null,
  armband: '1',
  run_order: 1,
  is_scored: false,
  result_status: 'pending',
  is_in_ring: false,
  dog: { id: 'dog-1', call_name: 'Storm' },
  class: {
    id: 'class-1',
    name: 'Container',
    element: 'Container',
    level: 'Novice',
    status: 'in-progress',
    total_entries_count: 1,
    scored_count: 0,
  },
  trial: { id: 'trial-1', date: '2026-10-23', show: { id: 'show-1', name: 'Trial' } },
} as unknown as ShowDayDetailRow;

const notifyReplica = () => mocks.listeners.forEach(listener => listener());

/** check -> details -> progress is a chain of dependent queries: let each step land. */
async function flushChain() {
  // One act per step: React applies a render only when its act scope exits.
  for (let step = 0; step < 6; step++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
  }
}

async function mountAndSettle() {
  const queryClient = createTestQueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const view = renderHook(
    () => {
      return useShowDayData();
    },
    { wrapper }
  );
  await flushChain();
  return view;
}

describe('useShowDayData replica refresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.listeners.clear();
    mocks.check.mockReset().mockResolvedValue([checkRow('2026-10-23')]);
    mocks.details.mockReset().mockResolvedValue([detailRow]);
    mocks.progress.mockReset().mockResolvedValue([]);
    mocks.subscribe.mockReset().mockImplementation((listener: () => void) => {
      mocks.listeners.add(listener);
      return () => mocks.listeners.delete(listener);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('subscribes to the entries replica without the initial emit', async () => {
    await mountAndSettle();
    expect(mocks.subscribe).toHaveBeenCalledTimes(1);
    expect(mocks.subscribe).toHaveBeenCalledWith(expect.any(Function), { emitCurrent: false });
  });

  it('refreshes all three reads once per coalesce window, however many notices arrive', async () => {
    await mountAndSettle();
    expect([mocks.check, mocks.details, mocks.progress].map(m => m.mock.calls.length)).toEqual([
      1, 1, 1,
    ]);

    // The replica notifies on a leading and a trailing edge, and in bursts.
    notifyReplica();
    notifyReplica();
    await vi.advanceTimersByTimeAsync(100);
    notifyReplica();

    await vi.advanceTimersByTimeAsync(SHOW_DAY_REPLICA_COALESCE_MS - 101);
    expect([mocks.check, mocks.details, mocks.progress].map(m => m.mock.calls.length)).toEqual([
      1, 1, 1,
    ]);

    await vi.advanceTimersByTimeAsync(2);
    await flushChain();
    expect([mocks.check, mocks.details, mocks.progress].map(m => m.mock.calls.length)).toEqual([
      2, 2, 2,
    ]);

    // Idle again: no further refetch without another notice.
    await vi.advanceTimersByTimeAsync(SHOW_DAY_REPLICA_COALESCE_MS * 2);
    expect(mocks.details).toHaveBeenCalledTimes(2);
  });

  it('does not poll details or ring progress on a timer inside the date-roll window', async () => {
    await mountAndSettle();

    await vi.advanceTimersByTimeAsync(SHOW_DAY_DATE_ROLL_MS - 1_000);
    expect(mocks.check).toHaveBeenCalledTimes(1);
    expect(mocks.details).toHaveBeenCalledTimes(1);
    expect(mocks.progress).toHaveBeenCalledTimes(1);

    // The one slow timer is the check query's, so the date can roll overnight.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(mocks.check).toHaveBeenCalledTimes(2);
    expect(mocks.details).toHaveBeenCalledTimes(1);
    expect(mocks.progress).toHaveBeenCalledTimes(1);
  });

  it('reads the date when the check runs, not when the hook last rendered', async () => {
    await mountAndSettle();
    vi.setSystemTime(new Date('2030-01-02T12:00:00'));
    await vi.advanceTimersByTimeAsync(SHOW_DAY_DATE_ROLL_MS);
    expect(mocks.check).toHaveBeenLastCalledWith('user-1', '2030-01-02');
  });

  it('refetches details when the active show day changes, since they are otherwise never stale', async () => {
    await mountAndSettle();
    mocks.check.mockResolvedValue([checkRow('2026-10-24')]);

    await vi.advanceTimersByTimeAsync(SHOW_DAY_DATE_ROLL_MS);
    await flushChain();
    expect(mocks.details).toHaveBeenCalledTimes(2);
  });

  it('stops listening on unmount and drops a pending refresh', async () => {
    const { unmount } = await mountAndSettle();
    notifyReplica();
    unmount();
    expect(mocks.listeners.size).toBe(0);
    await vi.advanceTimersByTimeAsync(SHOW_DAY_REPLICA_COALESCE_MS * 2);
    expect(mocks.details).toHaveBeenCalledTimes(1);
  });
});
