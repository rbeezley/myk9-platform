import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useHeldConflictCount } from '@/hooks/useHeldConflictCount';
import { CONFLICT_SETTLED_EVENT } from './conflictEvents';
import { listHeldConflicts, reopenHeldConflicts } from './heldConflicts';

const { tables } = vi.hoisted(() => ({
  tables: {
    classes: { getConflictedRows: vi.fn() },
    entries: { getConflictedRows: vi.fn() },
  },
}));

vi.mock('@/providers/ReplicationSyncProvider', () => ({
  REPLICATED_TABLES: [
    { name: 'classes', table: tables.classes },
    { name: 'entries', table: tables.entries },
  ],
}));

const classSnapshot = { tableName: 'classes', rowId: 'class-1' };

describe('held conflicts', () => {
  beforeEach(() => {
    tables.classes.getConflictedRows.mockResolvedValue([classSnapshot]);
    tables.entries.getConflictedRows.mockResolvedValue([]);
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('lists the persisted snapshots of every table, skipping one that cannot be read', async () => {
    expect(await listHeldConflicts()).toEqual([classSnapshot]);
    tables.entries.getConflictedRows.mockRejectedValue(new Error('idb'));
    expect(await listHeldConflicts()).toEqual([classSnapshot]);
  });

  it('re-dispatches each snapshot as replication:conflict, the event behind the existing notice', async () => {
    const raised: unknown[] = [];
    const listen = (event: Event) => raised.push((event as CustomEvent).detail);
    window.addEventListener('replication:conflict', listen);
    try {
      expect(await reopenHeldConflicts()).toBe(1);
    } finally {
      window.removeEventListener('replication:conflict', listen);
    }
    expect(raised).toEqual([classSnapshot]);
  });

  it('raises nothing when no conflict is held', async () => {
    tables.classes.getConflictedRows.mockResolvedValue([]);
    expect(await reopenHeldConflicts()).toBe(0);
  });

  it('counts held conflicts and drops to zero once a choice is saved', async () => {
    const { result } = renderHook(() => useHeldConflictCount(60_000));
    await waitFor(() => expect(result.current).toBe(1));

    tables.classes.getConflictedRows.mockResolvedValue([]);
    await act(async () => {
      window.dispatchEvent(new CustomEvent(CONFLICT_SETTLED_EVENT));
    });
    await waitFor(() => expect(result.current).toBe(0));
  });
});
