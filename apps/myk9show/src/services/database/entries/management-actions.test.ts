import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { executeStatusChange, executeBulkStatusChange } from './management-actions';
import type { BulkStatusChangeAdapters } from './management-actions';

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

    const result = await executeStatusChange(
      { entryId: 'entry-1', newStatus: EntryStatus.ACCEPTED, entry, userId: 'sec-1' },
      { changeSecretaryStatus, patchEntries }
    );

    expect(result).toBe(true);
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

    const result = await executeStatusChange(
      { entryId: 'entry-1', newStatus: EntryStatus.ACCEPTED, entry, userId: 'sec-1' },
      { changeSecretaryStatus, patchEntries }
    );

    expect(result).toBe(false);
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
    const sibling = makeEntry({ id: 'entry-2' });
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
    expect(
      result.find((e: EntryManagementEntry) => e.id === 'entry-3')?.armbandNumber
    ).toBeUndefined();
  });
});

// ─── executeBulkStatusChange ──────────────────────────────────────────────

describe('executeBulkStatusChange', () => {
  let bulkUpdateStatus: ReturnType<typeof vi.fn<BulkStatusChangeAdapters['bulkUpdateStatus']>>;
  let reloadEntries: ReturnType<typeof vi.fn<BulkStatusChangeAdapters['reloadEntries']>>;
  let patchEntries: ReturnType<typeof vi.fn<BulkStatusChangeAdapters['patchEntries']>>;
  let setError: ReturnType<typeof vi.fn<BulkStatusChangeAdapters['setError']>>;

  beforeEach(() => {
    bulkUpdateStatus = vi.fn().mockResolvedValue({ error: null });
    reloadEntries = vi.fn().mockResolvedValue(undefined);
    patchEntries = vi.fn();
    setError = vi.fn();
  });

  it('does not reload immediately for ACCEPTED because replicated mutations upload later', async () => {
    await executeBulkStatusChange(
      { entryIds: ['e1', 'e2'], status: EntryStatus.ACCEPTED, selectedShowId: 'show-1' },
      { bulkUpdateStatus, reloadEntries, patchEntries, setError }
    );

    expect(reloadEntries).not.toHaveBeenCalled();
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

    const result = await executeBulkStatusChange(
      { entryIds: ['entry-1'], status: EntryStatus.REJECTED, selectedShowId: 'show-1' },
      { bulkUpdateStatus, reloadEntries, patchEntries, setError }
    );

    expect(result.updated).toBe(true);
    expect(patchEntries).toHaveBeenCalledTimes(1);
    const updater = patchEntries.mock.calls[0]?.[0];
    const [updated] = updater([entry]);
    expect(updated.entryStatus).toBe(EntryStatus.REJECTED);
  });

  it('sets error and does not update entries when the DB call fails', async () => {
    bulkUpdateStatus.mockResolvedValue({ error: new Error('db fail') });

    const result = await executeBulkStatusChange(
      { entryIds: ['e1'], status: EntryStatus.ACCEPTED, selectedShowId: 'show-1' },
      { bulkUpdateStatus, reloadEntries, patchEntries, setError }
    );

    expect(result.updated).toBe(false);
    expect(setError).toHaveBeenCalledWith('Failed to update entry statuses');
    expect(patchEntries).not.toHaveBeenCalled();
    expect(reloadEntries).not.toHaveBeenCalled();
  });

  it('does nothing when entryIds is empty', async () => {
    const result = await executeBulkStatusChange(
      { entryIds: [], status: EntryStatus.ACCEPTED, selectedShowId: 'show-1' },
      { bulkUpdateStatus, reloadEntries, patchEntries, setError }
    );

    expect(result.updated).toBe(false);
    expect(bulkUpdateStatus).not.toHaveBeenCalled();
  });
});
