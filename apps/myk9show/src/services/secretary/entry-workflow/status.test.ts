import { describe, expect, it, vi } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { changeSecretaryEntryStatus } from './status';

function makeEntry(overrides: Partial<EntryManagementEntry> = {}): EntryManagementEntry {
  return {
    id: 'entry-1',
    registrationId: 'registration-1',
    entryNumber: '101',
    showId: 'show-1',
    dogId: 'dog-1',
    dogName: 'Promise',
    ownerName: 'Example Owner',
    ownerEmail: 'owner@example.test',
    handlerName: 'Example Handler',
    classes: [],
    totalFee: 25,
    paidAmount: 0,
    entryStatus: EntryStatus.PENDING,
    paymentStatus: PaymentStatus.PENDING,
    submittedAt: new Date('2026-05-08T12:00:00Z'),
    lastUpdated: new Date('2026-05-08T12:00:00Z'),
    ...overrides,
  };
}

describe('changeSecretaryEntryStatus', () => {
  it('maps accepted entries to the DB status and returns known armband patch data', async () => {
    const setEntryLifecycleStatus = vi.fn().mockResolvedValue({ data: {}, error: null });
    const auditLog = vi.fn().mockResolvedValue(undefined);

    const result = await changeSecretaryEntryStatus(
      {
        entry: makeEntry({
          armbandNumber: '140',
          classes: [{ id: 'class-1', name: 'Novice', number: '1', fee: 25, status: 'entered' }],
        }),
        newStatus: EntryStatus.ACCEPTED,
        secretaryId: 'secretary-1',
      },
      { setEntryLifecycleStatus, auditLog }
    );

    expect(setEntryLifecycleStatus).toHaveBeenCalledWith({
      entryId: 'entry-1',
      status: 'confirmed',
      reason: undefined,
      sourceEntry: {
        id: 'entry-1',
        showId: 'show-1',
        classId: 'class-1',
        dogId: 'dog-1',
        handler: 'Example Handler',
        armband: '140',
        registrationId: 'registration-1',
        entryStatus: 'submitted',
        paymentStatus: PaymentStatus.PENDING,
      },
    });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'entry',
        entityId: 'entry-1',
        changes: { entryStatus: { from: EntryStatus.PENDING, to: EntryStatus.ACCEPTED } },
      })
    );
    expect(result).toEqual({
      armbandPatch: {
        armband: '140',
        dogId: 'dog-1',
        showId: 'show-1',
      },
    });
  });

  it('does not race the server trigger for accepted entries with no known armband', async () => {
    const setEntryLifecycleStatus = vi.fn().mockResolvedValue({ data: {}, error: null });
    const auditLog = vi.fn().mockResolvedValue(undefined);

    const result = await changeSecretaryEntryStatus(
      {
        entry: makeEntry(),
        newStatus: EntryStatus.ACCEPTED,
      },
      { setEntryLifecycleStatus, auditLog }
    );

    expect(result).toEqual({});
  });

  it('persists withdrawal reasons and skips armband lookup for non-accepted statuses', async () => {
    const setEntryLifecycleStatus = vi.fn().mockResolvedValue({ data: {}, error: null });
    const auditLog = vi.fn().mockResolvedValue(undefined);

    const result = await changeSecretaryEntryStatus(
      {
        entry: makeEntry({ entryStatus: EntryStatus.ACCEPTED }),
        newStatus: EntryStatus.CANCELLED,
        secretaryId: 'secretary-1',
        withdrawalReason: 'Handler conflict',
      },
      { setEntryLifecycleStatus, auditLog }
    );

    expect(setEntryLifecycleStatus).toHaveBeenCalledWith({
      entryId: 'entry-1',
      status: 'withdrawn',
      reason: 'Handler conflict',
      sourceEntry: expect.objectContaining({
        id: 'entry-1',
        showId: 'show-1',
        dogId: 'dog-1',
      }),
    });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ withdrawalReason: 'Handler conflict' }),
      })
    );
    expect(result).toEqual({});
  });

  it('throws when the DB update fails so callers can rollback optimistic state', async () => {
    const error = new Error('update failed');
    const setEntryLifecycleStatus = vi.fn().mockResolvedValue({ data: null, error });
    const auditLog = vi.fn();

    await expect(
      changeSecretaryEntryStatus(
        {
          entry: makeEntry(),
          newStatus: EntryStatus.ACCEPTED,
        },
        { setEntryLifecycleStatus, auditLog }
      )
    ).rejects.toThrow('update failed');

    expect(auditLog).not.toHaveBeenCalled();
  });
});
