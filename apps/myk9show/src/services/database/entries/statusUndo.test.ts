import { describe, it, expect, vi } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import {
  executeStatusUndo,
  executeBulkStatusUndo,
  buildStatusUndoToastMessage,
  buildBulkStatusUndoToastMessage,
  type StatusUndoAdapters,
} from './statusUndo';

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
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PENDING,
    submittedAt: new Date('2026-01-01'),
    lastUpdated: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeAdapters(
  entry: EntryManagementEntry | undefined,
  overrides: Partial<StatusUndoAdapters> = {}
): { adapters: StatusUndoAdapters; changeSecretaryStatus: ReturnType<typeof vi.fn> } {
  const changeSecretaryStatus = vi.fn().mockResolvedValue({ armbandPatch: undefined });
  const adapters: StatusUndoAdapters = {
    getCurrentEntry: () => entry,
    isOnline: () => true,
    changeSecretaryStatus,
    patchEntries: vi.fn(),
    ...overrides,
  };
  return { adapters, changeSecretaryStatus };
}

describe('executeStatusUndo', () => {
  it('reverts to the prior status through the same secretary seam when online', async () => {
    const entry = makeEntry({ entryStatus: EntryStatus.ACCEPTED });
    const { adapters, changeSecretaryStatus } = makeAdapters(entry);

    const outcome = await executeStatusUndo(
      {
        entryId: 'entry-1',
        priorStatus: EntryStatus.PENDING,
        producedStatus: EntryStatus.ACCEPTED,
      },
      adapters
    );

    expect(outcome).toBe('reverted');
    // Inverse transition dispatched through the same seam (not restore_entry_status).
    expect(changeSecretaryStatus).toHaveBeenCalledWith(
      expect.objectContaining({ newStatus: EntryStatus.PENDING })
    );
  });

  it('aborts as superseded when current status no longer equals what our action produced', async () => {
    // Another actor moved the entry to SCRATCHED after our ACCEPT.
    const entry = makeEntry({ entryStatus: EntryStatus.SCRATCHED });
    const { adapters, changeSecretaryStatus } = makeAdapters(entry);

    const outcome = await executeStatusUndo(
      {
        entryId: 'entry-1',
        priorStatus: EntryStatus.PENDING,
        producedStatus: EntryStatus.ACCEPTED,
      },
      adapters
    );

    expect(outcome).toBe('superseded');
    expect(changeSecretaryStatus).not.toHaveBeenCalled();
  });

  it('reports the entry as missing when it is no longer in the local snapshot', async () => {
    const { adapters, changeSecretaryStatus } = makeAdapters(undefined);

    const outcome = await executeStatusUndo(
      { entryId: 'gone', priorStatus: EntryStatus.PENDING, producedStatus: EntryStatus.ACCEPTED },
      adapters
    );

    expect(outcome).toBe('missing');
    expect(changeSecretaryStatus).not.toHaveBeenCalled();
  });

  it('enqueues the inverse and reports "queued" when offline', async () => {
    const entry = makeEntry({ entryStatus: EntryStatus.ACCEPTED });
    const { adapters, changeSecretaryStatus } = makeAdapters(entry, { isOnline: () => false });

    const outcome = await executeStatusUndo(
      {
        entryId: 'entry-1',
        priorStatus: EntryStatus.PENDING,
        producedStatus: EntryStatus.ACCEPTED,
      },
      adapters
    );

    expect(outcome).toBe('queued');
    // Still dispatches through the queue-backed seam — honesty, not withholding.
    expect(changeSecretaryStatus).toHaveBeenCalledTimes(1);
  });

  it('reports failed when the seam rejects', async () => {
    const entry = makeEntry({ entryStatus: EntryStatus.ACCEPTED });
    const changeSecretaryStatus = vi.fn().mockRejectedValue(new Error('boom'));
    const adapters: StatusUndoAdapters = {
      getCurrentEntry: () => entry,
      isOnline: () => true,
      changeSecretaryStatus,
      patchEntries: vi.fn(),
    };

    const outcome = await executeStatusUndo(
      {
        entryId: 'entry-1',
        priorStatus: EntryStatus.PENDING,
        producedStatus: EntryStatus.ACCEPTED,
      },
      adapters
    );

    expect(outcome).toBe('failed');
  });
});

describe('executeBulkStatusUndo', () => {
  it('reverts the succeeded subset item-by-item, skipping superseded items', async () => {
    const entries = new Map<string, EntryManagementEntry>([
      ['a', makeEntry({ id: 'a', entryStatus: EntryStatus.ACCEPTED })],
      // 'b' was changed by someone else after the bulk accept.
      ['b', makeEntry({ id: 'b', entryStatus: EntryStatus.SCRATCHED })],
      ['c', makeEntry({ id: 'c', entryStatus: EntryStatus.ACCEPTED })],
    ]);
    const changeSecretaryStatus = vi.fn().mockResolvedValue({ armbandPatch: undefined });
    const adapters: StatusUndoAdapters = {
      getCurrentEntry: id => entries.get(id),
      isOnline: () => true,
      changeSecretaryStatus,
      patchEntries: vi.fn(),
    };

    const result = await executeBulkStatusUndo(
      [
        { entryId: 'a', priorStatus: EntryStatus.PENDING },
        { entryId: 'b', priorStatus: EntryStatus.PENDING },
        { entryId: 'c', priorStatus: EntryStatus.PENDING },
      ],
      EntryStatus.ACCEPTED,
      adapters
    );

    expect(result).toEqual({ reverted: 2, queued: 0, superseded: 1, failed: 0 });
    // Only the two non-superseded items dispatched.
    expect(changeSecretaryStatus).toHaveBeenCalledTimes(2);
  });
});

describe('undo toast messages', () => {
  it('maps single-undo outcomes to honest kinds/messages', () => {
    expect(buildStatusUndoToastMessage('reverted').kind).toBe('success');
    expect(buildStatusUndoToastMessage('queued').kind).toBe('info');
    expect(buildStatusUndoToastMessage('superseded')).toEqual({
      kind: 'error',
      message: 'Changed by someone else — not undone',
    });
    expect(buildStatusUndoToastMessage('failed').kind).toBe('error');
  });

  it('summarizes a fully-reverted bulk undo as success', () => {
    expect(
      buildBulkStatusUndoToastMessage({ reverted: 3, queued: 0, superseded: 0, failed: 0 })
    ).toEqual({ kind: 'success', message: 'Undid 3 changes' });
  });

  it('summarizes a mixed bulk undo as an error listing the problems', () => {
    const msg = buildBulkStatusUndoToastMessage({
      reverted: 2,
      queued: 0,
      superseded: 1,
      failed: 0,
    });
    expect(msg.kind).toBe('error');
    expect(msg.message).toContain('Undid 2');
    expect(msg.message).toContain('1 changed by someone else');
  });

  it('summarizes an all-queued bulk undo as info', () => {
    expect(
      buildBulkStatusUndoToastMessage({ reverted: 0, queued: 2, superseded: 0, failed: 0 }).kind
    ).toBe('info');
  });
});
