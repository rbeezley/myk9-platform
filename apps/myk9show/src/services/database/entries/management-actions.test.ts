import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import {
  executeStatusChange,
  executeBulkStatusChange,
  executeRemoveEntry,
} from './management-actions';

function makeEntry(overrides: Partial<EntryManagementEntry> = {}): EntryManagementEntry {
  return {
    id: 'entry-1',
    registrationId: 'reg-1',
    entryNumber: '42',
    showId: 'show-1',
    dogId: 'dog-1',
    dogName: 'Rex',
    ownerName: 'Alice',
    ownerEmail: 'alice@example.test',
    handlerName: 'Alice',
    classes: [],
    totalFee: 20,
    paidAmount: 20,
    entryStatus: EntryStatus.PENDING,
    paymentStatus: PaymentStatus.PENDING,
    submittedAt: new Date('2026-01-01'),
    lastUpdated: new Date('2026-01-01'),
    ...overrides,
  };
}

// ─── executeStatusChange ───────────────────────────────────────────────────

describe('executeStatusChange', () => {
  it('applies optimistic update before the async call', async () => {
    const patchEntries = vi.fn();
    const changeSecretaryStatus = vi.fn().mockResolvedValue({ armbandPatch: undefined });
    const entry = makeEntry();

    await executeStatusChange(
      { entryId: 'entry-1', newStatus: EntryStatus.ACCEPTED, entry, userId: 'sec-1' },
      { changeSecretaryStatus, patchEntries }
    );

    // First patchEntries call = optimistic update
    const optimisticUpdater = patchEntries.mock.calls[0]?.[0];
    expect(typeof optimisticUpdater).toBe('function');
    const [updated] = optimisticUpdater([entry]);
    expect(updated.entryStatus).toBe(EntryStatus.ACCEPTED);
  });

  it('rolls back to prior status when the write fails', async () => {
    const patchEntries = vi.fn();
    const changeSecretaryStatus = vi.fn().mockRejectedValue(new Error('network'));
    const entry = makeEntry({ entryStatus: EntryStatus.PENDING });

    await executeStatusChange(
      { entryId: 'entry-1', newStatus: EntryStatus.ACCEPTED, entry, userId: 'sec-1' },
      { changeSecretaryStatus, patchEntries }
    );

    // Two patchEntries calls: optimistic + rollback
    expect(patchEntries).toHaveBeenCalledTimes(2);
    const rollbackUpdater = patchEntries.mock.calls[1]?.[0];
    const [rolledBack] = rollbackUpdater([{ ...entry, entryStatus: EntryStatus.ACCEPTED }]);
    expect(rolledBack.entryStatus).toBe(EntryStatus.PENDING);
  });

  it('does not call patchEntries a second time when the write succeeds', async () => {
    const patchEntries = vi.fn();
    const changeSecretaryStatus = vi.fn().mockResolvedValue({ armbandPatch: undefined });
    const entry = makeEntry();

    await executeStatusChange(
      { entryId: 'entry-1', newStatus: EntryStatus.ACCEPTED, entry },
      { changeSecretaryStatus, patchEntries }
    );

    expect(patchEntries).toHaveBeenCalledTimes(1);
  });

  it('applies the armbandPatch to all entries for that dog/show on success', async () => {
    const patchEntries = vi.fn();
    const changeSecretaryStatus = vi.fn().mockResolvedValue({
      armbandPatch: { armband: '007', dogId: 'dog-1', showId: 'show-1' },
    });
    const entry = makeEntry();
    const sibling = makeEntry({ id: 'entry-2', armbandNumber: undefined });
    const other = makeEntry({ id: 'entry-3', dogId: 'dog-2' });

    await executeStatusChange(
      { entryId: 'entry-1', newStatus: EntryStatus.ACCEPTED, entry, userId: 'sec-1' },
      { changeSecretaryStatus, patchEntries }
    );

    // Second patchEntries call = armband patch (not a rollback since write succeeded)
    expect(patchEntries).toHaveBeenCalledTimes(2);
    const armbandUpdater = patchEntries.mock.calls[1]?.[0];
    const result = armbandUpdater([entry, sibling, other]);
    expect(result.find((e: EntryManagementEntry) => e.id === 'entry-1')?.armbandNumber).toBe('007');
    expect(result.find((e: EntryManagementEntry) => e.id === 'entry-2')?.armbandNumber).toBe('007');
    expect(result.find((e: EntryManagementEntry) => e.id === 'entry-3')?.armbandNumber).toBeUndefined();
  });
});

// ─── executeBulkStatusChange ──────────────────────────────────────────────

describe('executeBulkStatusChange', () => {
  let bulkUpdateStatus: ReturnType<typeof vi.fn>;
  let reloadEntries: ReturnType<typeof vi.fn>;
  let patchEntries: ReturnType<typeof vi.fn>;
  let setError: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    bulkUpdateStatus = vi.fn().mockResolvedValue({ error: null });
    reloadEntries = vi.fn().mockResolvedValue(undefined);
    patchEntries = vi.fn();
    setError = vi.fn();
  });

  it('calls reloadEntries when status is ACCEPTED', async () => {
    await executeBulkStatusChange(
      { entryIds: ['e1', 'e2'], status: EntryStatus.ACCEPTED, selectedShowId: 'show-1' },
      { bulkUpdateStatus, reloadEntries, patchEntries, setError }
    );

    expect(reloadEntries).toHaveBeenCalledWith('show-1');
  });

  it('does NOT call reloadEntries when status is not ACCEPTED', async () => {
    for (const status of [EntryStatus.PENDING, EntryStatus.REJECTED, EntryStatus.WAITLIST]) {
      reloadEntries.mockClear();
      await executeBulkStatusChange(
        { entryIds: ['e1'], status, selectedShowId: 'show-1' },
        { bulkUpdateStatus, reloadEntries, patchEntries, setError }
      );
      expect(reloadEntries).not.toHaveBeenCalled();
    }
  });

  it('updates entries optimistically in local state after a successful write', async () => {
    const entry = makeEntry({ entryStatus: EntryStatus.PENDING });

    await executeBulkStatusChange(
      { entryIds: ['entry-1'], status: EntryStatus.REJECTED, selectedShowId: 'show-1' },
      { bulkUpdateStatus, reloadEntries, patchEntries, setError }
    );

    expect(patchEntries).toHaveBeenCalledTimes(1);
    const updater = patchEntries.mock.calls[0]?.[0];
    const [updated] = updater([entry]);
    expect(updated.entryStatus).toBe(EntryStatus.REJECTED);
  });

  it('sets error and does not update entries when the DB call fails', async () => {
    bulkUpdateStatus.mockResolvedValue({ error: new Error('db fail') });

    await executeBulkStatusChange(
      { entryIds: ['e1'], status: EntryStatus.ACCEPTED, selectedShowId: 'show-1' },
      { bulkUpdateStatus, reloadEntries, patchEntries, setError }
    );

    expect(setError).toHaveBeenCalledWith('Failed to update entry statuses');
    expect(patchEntries).not.toHaveBeenCalled();
    expect(reloadEntries).not.toHaveBeenCalled();
  });

  it('does nothing when entryIds is empty', async () => {
    await executeBulkStatusChange(
      { entryIds: [], status: EntryStatus.ACCEPTED, selectedShowId: 'show-1' },
      { bulkUpdateStatus, reloadEntries, patchEntries, setError }
    );

    expect(bulkUpdateStatus).not.toHaveBeenCalled();
  });
});

// ─── executeRemoveEntry ──────────────────────────────────────────────────

describe('executeRemoveEntry', () => {
  let deleteEntry: ReturnType<typeof vi.fn>;
  let patchEntries: ReturnType<typeof vi.fn>;
  let setError: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    deleteEntry = vi.fn().mockResolvedValue({ error: null });
    patchEntries = vi.fn();
    setError = vi.fn();
  });

  it('optimistically removes the entry from state before the DB call', async () => {
    const entry = makeEntry();

    await executeRemoveEntry(
      { entryId: 'entry-1', currentEntries: [entry] },
      { deleteEntry, patchEntries, setError }
    );

    const optimisticUpdater = patchEntries.mock.calls[0]?.[0];
    expect(typeof optimisticUpdater).toBe('function');
    expect(optimisticUpdater([entry])).toEqual([]);
  });

  it('rolls back to the snapshot when the DB call fails', async () => {
    deleteEntry.mockResolvedValue({ error: new Error('db fail') });
    const entry = makeEntry();

    await executeRemoveEntry(
      { entryId: 'entry-1', currentEntries: [entry] },
      { deleteEntry, patchEntries, setError }
    );

    // patchEntries called twice: optimistic + rollback
    expect(patchEntries).toHaveBeenCalledTimes(2);
    // Second call restores the full snapshot (not an updater function — a direct value)
    const rollbackArg = patchEntries.mock.calls[1]?.[0];
    // Accept either a direct value or a function returning the snapshot
    if (typeof rollbackArg === 'function') {
      expect(rollbackArg([])).toEqual([entry]);
    } else {
      expect(rollbackArg).toEqual([entry]);
    }
  });

  it('clears error and does not roll back on success', async () => {
    const entry = makeEntry();

    await executeRemoveEntry(
      { entryId: 'entry-1', userId: 'sec-1', currentEntries: [entry] },
      { deleteEntry, patchEntries, setError }
    );

    expect(patchEntries).toHaveBeenCalledTimes(1);
    expect(setError).toHaveBeenCalledWith(null);
    expect(deleteEntry).toHaveBeenCalledWith('entry-1', 'sec-1');
  });

  it('does nothing when the entry is not found in currentEntries', async () => {
    await executeRemoveEntry(
      { entryId: 'missing', currentEntries: [makeEntry()] },
      { deleteEntry, patchEntries, setError }
    );

    expect(deleteEntry).not.toHaveBeenCalled();
    expect(patchEntries).not.toHaveBeenCalled();
  });
});
