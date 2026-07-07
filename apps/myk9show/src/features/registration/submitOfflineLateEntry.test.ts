import { beforeEach, describe, expect, it, vi } from 'vitest';
import { submitOfflineLateEntry } from './submitOfflineLateEntry';

const {
  getEntriesByShowMock,
  createEntryMock,
  getPendingMutationIdsForRowMock,
} = vi.hoisted(() => ({
  getEntriesByShowMock: vi.fn(),
  createEntryMock: vi.fn(),
  getPendingMutationIdsForRowMock: vi.fn(),
}));

vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: {
    getEntriesByShow: getEntriesByShowMock,
    createEntry: createEntryMock,
  },
  replicatedDogsTable: {
    getPendingMutationIdsForRow: getPendingMutationIdsForRowMock,
  },
}));

describe('submitOfflineLateEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEntriesByShowMock.mockResolvedValue([{ id: 'existing-entry', armband: '12' }]);
    getPendingMutationIdsForRowMock.mockResolvedValue(['dog-mutation-1']);
    createEntryMock.mockImplementation(entry =>
      Promise.resolve({
        ...entry,
        _syncStatus: 'pending',
        _localOnly: true,
      })
    );
  });

  it('creates confirmed replicated day-of entries with payment and dog dependency metadata', async () => {
    const result = await submitOfflineLateEntry({
      showId: 'show-1',
      paymentMethod: 'cash',
      paymentDetails: { paymentNotes: 'Paid at desk' },
      showFeeInfo: {
        preEntryFee: '25',
        dayOfShowFee: '35',
        startDate: '2026-07-01',
      },
      classes: [
        { id: 'class-1', entryFee: 30 },
        { id: 'class-2', entryFee: 32 },
      ],
      classSelections: [
        {
          dogId: 'dog-1',
          trialId: 'trial-1',
          selectedClasses: [
            { classId: 'class-1', jumpHeight: '16' },
            { classId: 'class-2' },
          ],
        },
      ],
      handlerAssignments: {
        'dog-1|class-1': {
          handlerId: 'handler-1',
          handlerName: 'Jamie Walker',
          isOwner: true,
        },
      },
    });

    expect(getPendingMutationIdsForRowMock).toHaveBeenCalledWith('dog-1');
    expect(createEntryMock).toHaveBeenCalledTimes(2);
    expect(createEntryMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        dogId: 'dog-1',
        showId: 'show-1',
        classId: 'class-1',
        trialId: 'trial-1',
        handler: 'Jamie Walker',
        handlerId: 'handler-1',
        isDayOfShow: true,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        entryStatus: 'confirmed',
        entry_status: 'confirmed',
        entryFee: 35,
        armband: '13',
        jumpHeight: '16',
        specialRequests: 'Paid at desk',
      }),
      'dog-mutation-1'
    );
    expect(createEntryMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        classId: 'class-2',
        armband: '13',
        entryFee: 35,
      }),
      'dog-mutation-1'
    );
    expect(result.armbandAssignments).toEqual([{ dogId: 'dog-1', armband: '13' }]);
    expect(result.entryIds).toHaveLength(2);
  });
});
