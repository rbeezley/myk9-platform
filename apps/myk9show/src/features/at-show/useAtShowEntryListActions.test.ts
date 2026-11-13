/**
 * Tests for useAtShowEntryListActions — the real check-in-status mutation core.
 * Assertion-first (CLAUDE.md): prove each status maps to the exact shared
 * replicated check-in writer, and that reset clears the scored fields back to
 * pending (the cleared columns are ringside-whitelisted so the write
 * auto-routes through ringside_update_entry).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const updateEntry = vi.fn<(id: string, updates: Record<string, unknown>) => Promise<string | null>>(
  () => Promise.resolve('mutation-1')
);
const updateSelfCheckInStatus = vi.fn<
  (id: string, status: string, expected?: unknown) => Promise<number | undefined>
>(() => Promise.resolve(undefined));

// The row `updateEntryWith` hands its builder (the hydrated row the real table
// writes against); the builder's payload lands in `updateEntry`.
const currentRow = vi.fn<(id: string) => Record<string, unknown>>(() => ({}));

vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: {
    updateEntry: (id: string, updates: Record<string, unknown>) => updateEntry(id, updates),
    updateEntryWith: (id: string, build: (row: unknown) => Record<string, unknown>) =>
      updateEntry(id, build(currentRow(id))),
  },
}));
vi.mock('@/services/show-day/checkInStatus', () => ({
  updateReplicatedCheckInStatus: (id: string, status: string) =>
    updateEntry(id, { checkInStatus: status, check_in_status: status }),
  updateSelfCheckInStatus: (id: string, status: string, expected?: unknown) =>
    expected === undefined
      ? updateSelfCheckInStatus(id, status)
      : updateSelfCheckInStatus(id, status, expected),
  isStaleCheckIn: (error: unknown) => (error as Error | undefined)?.name === 'StaleCheckInError',
}));
vi.mock('@/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));

import { useAtShowEntryListActions } from './useAtShowEntryListActions';
import type { CheckInWriter } from '@/services/show-day/checkInStatus';

describe('useAtShowEntryListActions', () => {
  const refresh = vi.fn(() => Promise.resolve());

  beforeEach(() => {
    updateEntry.mockClear();
    currentRow.mockClear();
    updateSelfCheckInStatus.mockClear();
    refresh.mockClear();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  const render = (writer?: CheckInWriter) =>
    renderHook(() => useAtShowEntryListActions(writer ? { refresh, writer } : { refresh }));

  it('handleStatusChange writes the exact check-in status (camel + snake), then refreshes', async () => {
    const { result } = render();
    await act(async () => {
      await result.current.handleStatusChange('entry-uuid-1', 'checked-in');
    });
    expect(updateEntry).toHaveBeenCalledWith('entry-uuid-1', {
      checkInStatus: 'checked-in',
      check_in_status: 'checked-in',
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('handleMarkInRing writes in-ring', async () => {
    const { result } = render();
    await act(async () => {
      await result.current.handleMarkInRing('entry-uuid-2');
    });
    expect(updateEntry).toHaveBeenCalledWith('entry-uuid-2', {
      checkInStatus: 'in-ring',
      check_in_status: 'in-ring',
    });
  });

  it('handleMarkCompleted writes completed', async () => {
    const { result } = render();
    await act(async () => {
      await result.current.handleMarkCompleted('entry-uuid-3');
    });
    expect(updateEntry).toHaveBeenCalledWith('entry-uuid-3', {
      checkInStatus: 'completed',
      check_in_status: 'completed',
    });
  });

  it('handleToggleInRing flips current in-ring → no-status', async () => {
    const { result } = render();
    await act(async () => {
      await result.current.handleToggleInRing('entry-uuid-4', true);
    });
    expect(updateEntry).toHaveBeenCalledWith('entry-uuid-4', {
      checkInStatus: 'no-status',
      check_in_status: 'no-status',
    });
  });

  it('handleBatchStatusUpdate writes every entry id', async () => {
    const { result } = render();
    await act(async () => {
      await result.current.handleBatchStatusUpdate(['a', 'b'], 'pulled');
    });
    expect(updateEntry).toHaveBeenCalledWith('a', {
      checkInStatus: 'pulled',
      check_in_status: 'pulled',
    });
    expect(updateEntry).toHaveBeenCalledWith('b', {
      checkInStatus: 'pulled',
      check_in_status: 'pulled',
    });
  });

  it('handleResetScore clears the scored fields back to pending, then refreshes', async () => {
    const { result } = render();
    await act(async () => {
      await result.current.handleResetScore('entry-uuid-5');
    });
    expect(updateEntry).toHaveBeenCalledWith('entry-uuid-5', {
      isScored: false,
      is_scored: false,
      resultStatus: 'pending',
      result_status: 'pending',
      searchTimeSeconds: 0,
      search_time_seconds: 0,
      totalFaults: 0,
      total_faults: 0,
      finalPlacement: null,
      scoringCompletedAt: null,
      scoring_completed_at: null,
      disqualification_reason: null,
      // Detailed scent-work columns also cleared so a reset doesn't leave stale
      // area times / counts / points on the entry.
      area1_time_seconds: null,
      area2_time_seconds: null,
      area3_time_seconds: null,
      area4_time_seconds: null,
      total_correct_finds: null,
      total_incorrect_finds: null,
      no_finish_count: null,
      points_earned: null,
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('handleResetScore puts a completed dog back to checked-in in the same write (MYK9-1737)', async () => {
    currentRow.mockReturnValueOnce({ id: 'entry-uuid-7', checkInStatus: 'completed' });
    const { result } = render();
    await act(async () => {
      await result.current.handleResetScore('entry-uuid-7');
    });
    expect(updateEntry).toHaveBeenCalledTimes(1);
    expect(updateEntry).toHaveBeenCalledWith(
      'entry-uuid-7',
      expect.objectContaining({
        is_scored: false,
        result_status: 'pending',
        checkInStatus: 'checked-in',
        check_in_status: 'checked-in',
      })
    );
  });

  it('surfaces hasError when a mutation throws', async () => {
    updateEntry.mockRejectedValueOnce(new Error('offline'));
    const { result } = render();
    await act(async () => {
      await result.current.handleMarkInRing('entry-uuid-6').catch(() => {});
    });
    await waitFor(() => expect(result.current.hasError).toBe(true));
  });

  // ── Writer branch (exhibitor self-check-in) ──────────────────────────────
  // An exhibitor-role account lacks the staff RLS authority the replicated
  // writer (ringside_update_entry) needs, so its check-in writes MUST route
  // through the ownership-scoped self_checkin_entry RPC. The default writer is
  // 'replicated' (staff); only writer:'self-checkin-rpc' flips the path.
  describe("writer:'self-checkin-rpc' (exhibitor)", () => {
    it('handleStatusChange routes through the self-check-in RPC, NOT the replicated writer', async () => {
      const { result } = render('self-checkin-rpc');
      await act(async () => {
        await result.current.handleStatusChange('entry-uuid-7', 'checked-in');
      });
      expect(updateSelfCheckInStatus).toHaveBeenCalledWith('entry-uuid-7', 'checked-in');
      expect(updateEntry).not.toHaveBeenCalled();
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('handleToggleInRing self-checks through the RPC', async () => {
      const { result } = render('self-checkin-rpc');
      await act(async () => {
        await result.current.handleToggleInRing('entry-uuid-8', true);
      });
      expect(updateSelfCheckInStatus).toHaveBeenCalledWith('entry-uuid-8', 'no-status');
      expect(updateEntry).not.toHaveBeenCalled();
    });

    it('handleBatchStatusUpdate self-checks every entry through the RPC', async () => {
      const { result } = render('self-checkin-rpc');
      await act(async () => {
        await result.current.handleBatchStatusUpdate(['a', 'b'], 'pulled');
      });
      expect(updateSelfCheckInStatus).toHaveBeenCalledWith('a', 'pulled');
      expect(updateSelfCheckInStatus).toHaveBeenCalledWith('b', 'pulled');
      expect(updateEntry).not.toHaveBeenCalled();
    });

    it("remembers the version a Pull produced and sends it back with that Pull's Undo (MYK9-1911)", async () => {
      updateSelfCheckInStatus.mockResolvedValueOnce(7);
      const { result } = render('self-checkin-rpc');
      await act(async () => {
        await result.current.handleStatusChange('entry-uuid-1', 'pulled');
      });
      expect(result.current.lastWriteVersion('entry-uuid-1')).toBe(7);

      await act(async () => {
        await result.current.handleUndoPull('entry-uuid-1', 'checked-in', 7);
      });
      expect(updateSelfCheckInStatus).toHaveBeenLastCalledWith('entry-uuid-1', 'checked-in', {
        status: 'pulled',
        pullSource: 'exhibitor',
        version: 7,
      });
    });

    it('refreshes the list and rethrows when the server refuses a stale Undo', async () => {
      const stale = Object.assign(new Error('stale'), { name: 'StaleCheckInError' });
      updateSelfCheckInStatus.mockRejectedValueOnce(stale);
      const { result } = render('self-checkin-rpc');
      await expect(
        act(async () => {
          await result.current.handleUndoPull('entry-uuid-2', 'checked-in', 3);
        })
      ).rejects.toBe(stale);
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('surfaces hasError when the self-check-in RPC rejects (e.g. not authorized)', async () => {
      updateSelfCheckInStatus.mockRejectedValueOnce(new Error('Not authorized'));
      const { result } = render('self-checkin-rpc');
      await act(async () => {
        await result.current.handleStatusChange('entry-uuid-9', 'checked-in').catch(() => {});
      });
      await waitFor(() => expect(result.current.hasError).toBe(true));
    });
  });

  it("default writer ('replicated') never touches the self-check-in RPC", async () => {
    const { result } = render();
    await act(async () => {
      await result.current.handleStatusChange('entry-uuid-10', 'checked-in');
    });
    expect(updateEntry).toHaveBeenCalledTimes(1);
    expect(updateSelfCheckInStatus).not.toHaveBeenCalled();
  });
});
