import { beforeEach, describe, expect, it, vi } from 'vitest';
import { submitOfflineLateEntry } from './submitOfflineLateEntry';

const {
  createEntryMock,
  getPendingMutationIdsForRowMock,
  getPendingRegistrationMutationIdsForDogMock,
} = vi.hoisted(() => ({
  createEntryMock: vi.fn(),
  getPendingMutationIdsForRowMock: vi.fn(),
  getPendingRegistrationMutationIdsForDogMock: vi.fn(),
}));

vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: {
    createEntry: createEntryMock,
  },
  replicatedDogsTable: {
    getPendingMutationIdsForRow: getPendingMutationIdsForRowMock,
  },
  replicatedDogRegistrationsTable: {
    getPendingMutationIdsForDog: getPendingRegistrationMutationIdsForDogMock,
  },
}));

describe('submitOfflineLateEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPendingMutationIdsForRowMock.mockResolvedValue(['dog-mutation-1']);
    getPendingRegistrationMutationIdsForDogMock.mockResolvedValue(['registration-mutation-1']);
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
        paymentStatus: 'pending',
        entryStatus: 'confirmed',
        entry_status: 'confirmed',
        entryFee: 35,
        jumpHeight: '16',
        specialRequests: 'Paid at desk',
      }),
      ['dog-mutation-1', 'registration-mutation-1']
    );
    expect(createEntryMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        classId: 'class-2',
        entryFee: 35,
      }),
      ['dog-mutation-1', 'registration-mutation-1']
    );
    expect(result.armbandAssignments).toEqual([]);
    expect(result.entryIds).toHaveLength(2);
  });

  it.each([
    ['waived', 'waived'],
    ['secretary_paid', 'paid'],
    ['group_payment', 'paid'],
    ['check', 'pending'],
    ['cash', 'pending'],
  ] as const)('maps %s payments to %s replicated payment status', async (paymentMethod, status) => {
    await submitOfflineLateEntry({
      showId: 'show-1',
      paymentMethod,
      showFeeInfo: {
        preEntryFee: '25',
        dayOfShowFee: '35',
        startDate: '2026-07-01',
      },
      classes: [{ id: 'class-1', entryFee: 30 }],
      classSelections: [
        {
          dogId: 'dog-1',
          trialId: 'trial-1',
          selectedClasses: [{ classId: 'class-1' }],
        },
      ],
      handlerAssignments: {},
    });

    expect(createEntryMock).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMethod, paymentStatus: status }),
      ['dog-mutation-1', 'registration-mutation-1']
    );
  });
});
