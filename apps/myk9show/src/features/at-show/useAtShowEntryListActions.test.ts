/**
 * Tests for useAtShowEntryListActions — the real check-in-status mutation core.
 * Assertion-first (CLAUDE.md): prove each status maps to the exact
 * `updateEntry({ checkInStatus, check_in_status })` write, and that the
 * spike-stubbed reset does NOT touch the DB.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const updateEntry = vi.fn<(id: string, updates: Record<string, unknown>) => Promise<string | null>>(
  () => Promise.resolve('mutation-1')
);

vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: {
    updateEntry: (id: string, updates: Record<string, unknown>) => updateEntry(id, updates),
  },
}));
vi.mock('@/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));

import { useAtShowEntryListActions } from './useAtShowEntryListActions';

describe('useAtShowEntryListActions', () => {
  const refresh = vi.fn(() => Promise.resolve());

  beforeEach(() => {
    updateEntry.mockClear();
    refresh.mockClear();
  });
  afterEach(() => vi.clearAllMocks());

  const render = () => renderHook(() => useAtShowEntryListActions({ refresh }));

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
    expect(updateEntry).toHaveBeenCalledWith('a', { checkInStatus: 'pulled', check_in_status: 'pulled' });
    expect(updateEntry).toHaveBeenCalledWith('b', { checkInStatus: 'pulled', check_in_status: 'pulled' });
  });

  it('handleResetScore is a spike stub — no DB write', async () => {
    const { result } = render();
    await act(async () => {
      await result.current.handleResetScore('entry-uuid-5');
    });
    expect(updateEntry).not.toHaveBeenCalled();
  });

  it('surfaces hasError when a mutation throws', async () => {
    updateEntry.mockRejectedValueOnce(new Error('offline'));
    const { result } = render();
    await act(async () => {
      await result.current.handleMarkInRing('entry-uuid-6').catch(() => {});
    });
    await waitFor(() => expect(result.current.hasError).toBe(true));
  });
});
