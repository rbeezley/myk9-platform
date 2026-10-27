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

describe('executeStatusChange check-in patch and rollback (MYK9-1384)', () => {
  const checkedInClass = (checkInStatus: 'checked-in' | 'pulled') => ({
    id: 'entry-1',
    classId: 'class-1',
    name: 'Novice',
    number: '1',
    fee: 20,
    status: 'entered' as const,
    checkInStatus,
  });

  function run(
    entry: EntryManagementEntry,
    newStatus: EntryStatus,
    priorCheckInStatus?: 'checked-in',
    reject = false
  ) {
    const patchEntries = vi.fn();
    const changeSecretaryStatus = reject
      ? vi.fn().mockRejectedValue(new Error('offline write failed'))
      : vi.fn().mockResolvedValue({});
    const done = executeStatusChange(
      {
        entryId: 'entry-1',
        newStatus,
        entry,
        ...(priorCheckInStatus ? { priorCheckInStatus } : {}),
      },
      { changeSecretaryStatus, patchEntries }
    );
    const apply = (call: number, rows: EntryManagementEntry[]) =>
      (patchEntries.mock.calls[call]?.[0] as (p: EntryManagementEntry[]) => EntryManagementEntry[])(
        rows
      );
    return { done, apply, patchEntries };
  }

  it('patches the class check-in to pulled on a Pull', async () => {
    const entry = makeEntry({
      entryStatus: EntryStatus.ACCEPTED,
      classes: [checkedInClass('checked-in')],
    });
    const { done, apply } = run(entry, EntryStatus.SCRATCHED);
    await done;
    expect(apply(0, [entry])[0]?.classes[0]?.checkInStatus).toBe('pulled');
  });

  it('patches the class check-in back to the captured prior value on Undo from scratched', async () => {
    const entry = makeEntry({
      entryStatus: EntryStatus.SCRATCHED,
      classes: [checkedInClass('pulled')],
    });
    const { done, apply } = run(entry, EntryStatus.ACCEPTED, 'checked-in');
    await done;
    expect(apply(0, [entry])[0]?.classes[0]?.checkInStatus).toBe('checked-in');
  });

  it('rolls back only the check-in, leaving a concurrent class change alone', async () => {
    const entry = makeEntry({
      entryStatus: EntryStatus.ACCEPTED,
      classes: [checkedInClass('checked-in')],
    });
    const { done, apply } = run(entry, EntryStatus.SCRATCHED, undefined, true);
    expect(await done).toBe(false);

    const afterPatch = apply(0, [entry]);
    expect(afterPatch[0]?.classes[0]?.checkInStatus).toBe('pulled');
    // A concurrent edit lands on the class before the rollback runs.
    const concurrent = afterPatch.map(e => ({
      ...e,
      classes: e.classes.map(c => ({ ...c, fee: 99 })),
    }));
    const rolledBack = apply(1, concurrent)[0];
    expect(rolledBack?.entryStatus).toBe(EntryStatus.ACCEPTED);
    expect(rolledBack?.classes[0]?.checkInStatus).toBe('checked-in');
    expect(rolledBack?.classes[0]?.fee).toBe(99);
  });
});

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
