import { beforeEach, describe, expect, it, vi } from 'vitest';
import { submitOfflineLateEntry } from './submitOfflineLateEntry';
import { PaymentStatus } from '@/types/show-registration-types';

const {
  createEntryMock,
  getPendingMutationIdsForRowMock,
  getPendingRegistrationMutationIdsForDogMock,
  getShowByIdMock,
  getArmbandsByShowMock,
  upsertAssignedArmbandMock,
  getPendingArmbandMutationIdsForRowMock,
  getEntriesByShowMock,
  getAllClassesMock,
  getTrialsByShowMock,
  getJudgeAssignmentsByShowMock,
} = vi.hoisted(() => ({
  createEntryMock: vi.fn(),
  getPendingMutationIdsForRowMock: vi.fn(),
  getPendingRegistrationMutationIdsForDogMock: vi.fn(),
  getShowByIdMock: vi.fn(),
  getArmbandsByShowMock: vi.fn(),
  upsertAssignedArmbandMock: vi.fn(),
  getPendingArmbandMutationIdsForRowMock: vi.fn(),
  getEntriesByShowMock: vi.fn(),
  getAllClassesMock: vi.fn(),
  getTrialsByShowMock: vi.fn(),
  getJudgeAssignmentsByShowMock: vi.fn(),
}));

vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: {
    createEntry: createEntryMock,
    getEntriesByShow: getEntriesByShowMock,
  },
  replicatedDogsTable: {
    getPendingMutationIdsForRow: getPendingMutationIdsForRowMock,
  },
  replicatedDogRegistrationsTable: {
    getPendingMutationIdsForDog: getPendingRegistrationMutationIdsForDogMock,
  },
  replicatedShowsTable: {
    getShowById: getShowByIdMock,
  },
  replicatedClassesTable: {
    getAll: getAllClassesMock,
  },
  replicatedTrialsTable: {
    getTrialsByShow: getTrialsByShowMock,
  },
  replicatedJudgeAssignmentsTable: {
    getByShowId: getJudgeAssignmentsByShowMock,
  },
  replicatedArmbandsTable: {
    getByShow: getArmbandsByShowMock,
    upsertAssignedArmband: upsertAssignedArmbandMock,
    getPendingMutationIdsForRow: getPendingArmbandMutationIdsForRowMock,
  },
}));

describe('submitOfflineLateEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPendingMutationIdsForRowMock.mockResolvedValue(['dog-mutation-1']);
    getPendingRegistrationMutationIdsForDogMock.mockResolvedValue(['registration-mutation-1']);
    getShowByIdMock.mockResolvedValue({
      id: 'show-1',
      startingArmbandNumber: 100,
      defaultJudgeDayCapacity: 125,
    });
    getEntriesByShowMock.mockResolvedValue([]);
    getAllClassesMock.mockResolvedValue([
      { id: 'class-1', trialId: 'trial-1', maxEntries: 10 },
      { id: 'class-2', trialId: 'trial-1', maxEntries: 10 },
    ]);
    getTrialsByShowMock.mockResolvedValue([{ id: 'trial-1', date: '2026-07-13' }]);
    getJudgeAssignmentsByShowMock.mockResolvedValue([]);
    getArmbandsByShowMock.mockResolvedValue([{ id: 'existing-armband', armbandNumber: '12' }]);
    upsertAssignedArmbandMock.mockResolvedValue('armband-mutation-1');
    getPendingArmbandMutationIdsForRowMock.mockResolvedValue([]);
    createEntryMock.mockImplementation(entry =>
      Promise.resolve({
        ...entry,
        _syncStatus: 'pending',
        _localOnly: true,
      })
    );
  });

  it('creates confirmed replicated day-of entries with payment and dog dependency metadata', async () => {
    getAllClassesMock.mockResolvedValue([
      { id: 'class-1', trialId: 'trial-1', maxEntries: 1 },
      { id: 'class-2', trialId: 'trial-1', maxEntries: 10 },
    ]);
    getEntriesByShowMock.mockResolvedValue([{ classId: 'class-1', entryStatus: 'submitted' }]);

    const result = await submitOfflineLateEntry({
      showId: 'show-1',
      paymentMethod: 'cash',
      paymentDetails: {
        paymentNotes: 'Paid at desk',
        paymentReference: 'CHK-1042',
        paymentDate: '2026-08-28',
      },
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
          selectedClasses: [{ classId: 'class-1', jumpHeight: '16' }, { classId: 'class-2' }],
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
        entrySource: 'myk9',
        capacityOverride: true,
        paymentMethod: 'cash',
        paymentStatus: 'pending',
        entryStatus: 'confirmed',
        entry_status: 'confirmed',
        entryFee: 35,
        armband: '100',
        jumpHeight: '16',
        // Payment bookkeeping lands in its own columns, NOT in the
        // exhibitor-facing special_requests field it used to overwrite.
        paymentNotes: 'Paid at desk',
        payment_notes: 'Paid at desk',
        paymentReference: 'CHK-1042',
        payment_reference: 'CHK-1042',
        paymentReceivedOn: '2026-08-28',
        payment_received_on: '2026-08-28',
      }),
      ['dog-mutation-1', 'registration-mutation-1', 'armband-mutation-1']
    );
    expect(createEntryMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        classId: 'class-2',
        entryFee: 35,
        armband: '100',
      }),
      ['dog-mutation-1', 'registration-mutation-1', 'armband-mutation-1']
    );
    expect(upsertAssignedArmbandMock).toHaveBeenCalledWith({
      showId: 'show-1',
      dogId: 'dog-1',
      armbandNumber: '100',
      dependsOn: ['dog-mutation-1', 'registration-mutation-1'],
    });
    expect(result.armbandAssignments).toEqual([{ dogId: 'dog-1', armband: '100' }]);
    expect(result.entryIds).toHaveLength(2);
    expect(result.entryOutcomes).toEqual([
      expect.objectContaining({
        dogId: 'dog-1',
        classId: 'class-1',
        outcome: 'created',
        capacityOverride: true,
      }),
      expect.objectContaining({
        dogId: 'dog-1',
        classId: 'class-2',
        outcome: 'created',
        capacityOverride: false,
      }),
    ]);
  });

  it('records ordinary show-desk provenance without a false capacity override', async () => {
    await submitOfflineLateEntry({
      showId: 'show-1',
      paymentMethod: 'cash',
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
      expect.objectContaining({
        entrySource: 'myk9',
        capacityOverride: false,
      }),
      expect.any(Array)
    );
  });

  it('records an override only after an earlier dog in the batch consumes the final spot', async () => {
    getAllClassesMock.mockResolvedValue([{ id: 'class-1', trialId: 'trial-1', maxEntries: 1 }]);

    await submitOfflineLateEntry({
      showId: 'show-1',
      paymentMethod: 'cash',
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
        {
          dogId: 'dog-2',
          trialId: 'trial-1',
          selectedClasses: [{ classId: 'class-1' }],
        },
      ],
      handlerAssignments: {},
    });

    expect(createEntryMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ dogId: 'dog-1', capacityOverride: false }),
      expect.any(Array)
    );
    expect(createEntryMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ dogId: 'dog-2', capacityOverride: true }),
      expect.any(Array)
    );
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
      ['dog-mutation-1', 'registration-mutation-1', 'armband-mutation-1']
    );
  });

  it('marks check and cash entries paid when the secretary used a paid status action', async () => {
    await submitOfflineLateEntry({
      showId: 'show-1',
      paymentMethod: 'check',
      paymentStatus: PaymentStatus.PAID_BY_CHECK,
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
      expect.objectContaining({ paymentMethod: 'check', paymentStatus: 'paid' }),
      ['dog-mutation-1', 'registration-mutation-1', 'armband-mutation-1']
    );
  });

  it('starts local armband reservations from the cached show start number', async () => {
    getShowByIdMock.mockResolvedValue({ id: 'show-1', startingArmbandNumber: 250 });
    getArmbandsByShowMock.mockResolvedValue([]);

    const result = await submitOfflineLateEntry({
      showId: 'show-1',
      paymentMethod: 'secretary_paid',
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

    expect(upsertAssignedArmbandMock).toHaveBeenCalledWith(
      expect.objectContaining({ armbandNumber: '250' })
    );
    expect(createEntryMock).toHaveBeenCalledWith(expect.objectContaining({ armband: '250' }), [
      'dog-mutation-1',
      'registration-mutation-1',
      'armband-mutation-1',
    ]);
    expect(result.armbandAssignments).toEqual([{ dogId: 'dog-1', armband: '250' }]);
  });
});
