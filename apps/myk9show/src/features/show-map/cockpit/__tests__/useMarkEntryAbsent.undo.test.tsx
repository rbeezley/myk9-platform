/**
 * MYK9-2037: Undo of Mark absent clears the result only while the replica row still holds the
 * Absent this toast wrote. Every assertion reads the stored replica row, not the toast.
 */
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReplicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { supabase } from '@/services/database/supabaseClient';

const h = vi.hoisted(() => ({
  table: null as unknown as ReplicatedEntriesTable,
  stamp: '',
  undo: null as (() => void) | null,
  toastError: vi.fn(),
}));

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: { error: h.toastError, success: vi.fn() } }));
vi.mock('@/services/replication', () => ({
  get replicatedEntriesTable() {
    return h.table;
  },
}));
vi.mock('@/services/replication/ReplicatedEntriesTable', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/replication/ReplicatedEntriesTable')>()),
  get replicatedEntriesTable() {
    return h.table;
  },
}));
vi.mock('@/utils/checkInTransitions', () => ({ transitionToCompleted: vi.fn() }));
vi.mock('@/lib/undoToast', () => ({
  STATUS_UNDO_WINDOW_MS: 8000,
  showUndoToast: ({ onUndo }: { onUndo: () => void }) => {
    h.undo = onUndo;
  },
}));
vi.mock('@/hooks/useOptimisticScoring', () => ({
  useOptimisticScoring: () => ({
    submitScoreOptimistically: async ({ entryId, onSuccess }: never) => {
      await h.table.updateEntry(entryId, {
        resultStatus: 'absent',
        result_status: 'absent',
        isScored: true,
        is_scored: true,
        scoringCompletedAt: h.stamp,
        scoring_completed_at: h.stamp,
      });
      (onSuccess as () => void)();
    },
  }),
}));

import { useMarkEntryAbsent } from '../useMarkEntryAbsent';

const ROW = {
  id: 'entry-1',
  show_id: 'show-1',
  class_id: 'class-1',
  dog_id: 'dog-1',
  entry_status: 'confirmed',
  is_scored: false,
  result_status: 'pending',
  check_in_status: 'checked-in',
  version: 3,
};
const ENTRY = { entryId: 'entry-1', state: 'checked-in', queue: { armband: 101 } } as never;
const REFUSAL = 'Changed by someone else — not undone';

function mockReadBack(data: unknown) {
  const node: Record<string, unknown> = {};
  node.select = vi.fn(() => node);
  node.eq = vi.fn(() => node);
  node.maybeSingle = vi.fn(() => Promise.resolve({ data, error: null }));
  vi.mocked(supabase.from).mockReturnValue(node as never);
}

async function markAbsent(stamp: string) {
  h.stamp = stamp;
  const { result } = renderHook(() =>
    useMarkEntryAbsent({ classId: 'class-1', className: 'Novice A' })
  );
  result.current.request(ENTRY);
  await vi.waitFor(() => expect(h.undo).not.toBeNull());
}

async function pressUndo() {
  h.toastError.mockClear();
  h.undo?.();
  await new Promise(resolve => setTimeout(resolve, 50));
}

describe('Mark absent Undo (MYK9-2037)', () => {
  beforeEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
    vi.mocked(supabase.from).mockReset();
    h.table = new ReplicatedEntriesTable();
    await h.table.clearCache();
    h.undo = null;
    h.toastError.mockReset();
    mockReadBack(ROW);
    // Seed the replica from the server row, as a synced show would have it.
    await h.table.updateEntry('entry-1', { is_scored: false });
  });

  afterEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  it('restores the entry to unscored and pending when nothing changed', async () => {
    await markAbsent('2026-11-15T10:00:00.000Z');
    expect((await h.table.getEntryById('entry-1'))?.resultStatus).toBe('absent');

    await pressUndo();

    const stored = await h.table.getEntryById('entry-1');
    expect(stored?.resultStatus).toBe('pending');
    expect(stored?.isScored).toBe(false);
    expect(stored?.scoring_completed_at ?? null).toBeNull();
    expect(stored?.checkInStatus ?? stored?.check_in_status).toBe('checked-in');
    expect(h.toastError).not.toHaveBeenCalled();
  });

  it('still undoes after a sync rewrites the timestamp in the server format', async () => {
    await markAbsent('2026-11-15T10:00:00.000Z');
    await h.table.updateEntry('entry-1', {
      scoringCompletedAt: '2026-11-15T10:00:00+00:00',
      scoring_completed_at: '2026-11-15T10:00:00+00:00',
    });

    await pressUndo();

    expect((await h.table.getEntryById('entry-1'))?.resultStatus).toBe('pending');
    expect(h.toastError).not.toHaveBeenCalled();
  });

  it('keeps a real score recorded after the Absent and says why', async () => {
    await markAbsent('2026-11-15T10:00:00.000Z');
    await h.table.updateEntry('entry-1', {
      resultStatus: 'qualified',
      result_status: 'qualified',
      isScored: true,
      is_scored: true,
      searchTimeSeconds: 61,
      search_time_seconds: 61,
      scoringCompletedAt: '2026-11-15T10:00:05.000Z',
      scoring_completed_at: '2026-11-15T10:00:05.000Z',
    });

    await pressUndo();

    const stored = await h.table.getEntryById('entry-1');
    expect(stored?.resultStatus).toBe('qualified');
    expect(stored?.isScored).toBe(true);
    expect(stored?.searchTimeSeconds).toBe(61);
    expect(h.toastError).toHaveBeenCalledWith(REFUSAL);
  });

  it('keeps a later Absent, so an earlier toast cannot clear it', async () => {
    await markAbsent('2026-11-15T10:00:00.000Z');
    const firstUndo = h.undo;
    await h.table.updateEntry('entry-1', {
      resultStatus: 'absent',
      result_status: 'absent',
      scoringCompletedAt: '2026-11-15T10:01:00.000Z',
      scoring_completed_at: '2026-11-15T10:01:00.000Z',
    });

    h.undo = firstUndo;
    await pressUndo();

    const stored = await h.table.getEntryById('entry-1');
    expect(stored?.resultStatus).toBe('absent');
    expect(h.toastError).toHaveBeenCalledWith(REFUSAL);
  });
});
