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
  it('maps accepted entries to the DB status and returns trigger armband patch data', async () => {
    const updateEntryStatus = vi.fn().mockResolvedValue({ data: {}, error: null });
    const getEntryArmbandById = vi.fn().mockResolvedValue({
      armband: '140',
      dogId: 'dog-1',
      showId: 'show-1',
    });
    const auditLog = vi.fn().mockResolvedValue(undefined);

    const result = await changeSecretaryEntryStatus(
      {
        entry: makeEntry(),
        newStatus: EntryStatus.ACCEPTED,
        secretaryId: 'secretary-1',
      },
      { updateEntryStatus, getEntryArmbandById, auditLog }
    );

    expect(updateEntryStatus).toHaveBeenCalledWith('entry-1', 'confirmed', undefined);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'entry',
        entityId: 'entry-1',
        changes: { entryStatus: { from: EntryStatus.PENDING, to: EntryStatus.ACCEPTED } },
      })
    );
    expect(getEntryArmbandById).toHaveBeenCalledWith('entry-1');
    expect(result).toEqual({
      armbandPatch: {
        armband: '140',
        dogId: 'dog-1',
        showId: 'show-1',
      },
    });
  });

  it('persists withdrawal reasons and skips armband lookup for non-accepted statuses', async () => {
    const updateEntryStatus = vi.fn().mockResolvedValue({ data: {}, error: null });
    const getEntryArmbandById = vi.fn();
    const auditLog = vi.fn().mockResolvedValue(undefined);

    const result = await changeSecretaryEntryStatus(
      {
        entry: makeEntry({ entryStatus: EntryStatus.ACCEPTED }),
        newStatus: EntryStatus.CANCELLED,
        secretaryId: 'secretary-1',
        withdrawalReason: 'Handler conflict',
      },
      { updateEntryStatus, getEntryArmbandById, auditLog }
    );

    expect(updateEntryStatus).toHaveBeenCalledWith('entry-1', 'withdrawn', 'Handler conflict');
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ withdrawalReason: 'Handler conflict' }),
      })
    );
    expect(getEntryArmbandById).not.toHaveBeenCalled();
    expect(result).toEqual({});
  });

  it('throws when the DB update fails so callers can rollback optimistic state', async () => {
    const error = new Error('update failed');
    const updateEntryStatus = vi.fn().mockResolvedValue({ data: null, error });
    const getEntryArmbandById = vi.fn();
    const auditLog = vi.fn();

    await expect(
      changeSecretaryEntryStatus(
        {
          entry: makeEntry(),
          newStatus: EntryStatus.ACCEPTED,
        },
        { updateEntryStatus, getEntryArmbandById, auditLog }
      )
    ).rejects.toThrow('update failed');

    expect(auditLog).not.toHaveBeenCalled();
    expect(getEntryArmbandById).not.toHaveBeenCalled();
  });
});
