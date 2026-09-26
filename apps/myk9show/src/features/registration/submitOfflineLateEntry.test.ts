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

// This show has completed a scoped entries sync on this device (MYK9-761).
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    getSyncMetadata: async () => ({ tableName: 'entries', totalRows: 1 }),
  },
}));

// Structure coverage has its own tests (offlineCapacityOverride.structure.test.ts);
// here the show's structure is whole on the device.
vi.mock('@/features/offline-readiness/showStructureScopes', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/offline-readiness/showStructureScopes')>()),
  showStructureCoverage: async () => ({
    show: true,
    trials: true,
    classes: true,
    assignments: true,
  }),
}));

vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: {
    createEntry: createEntryMock,
    getEntriesByShow: getEntriesByShowMock,
    getByShowWithStatus: async () => ({
      ok: true,
      rows: (((await getEntriesByShowMock('show-1')) ?? []) as Array<Record<string, unknown>>).map(
        row => ({
          showId: 'show-1',
          ...row,
        })
      ),
      error: null,
    }),
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
    getAllOrThrow: getAllClassesMock,
    getAllWithStatus: async () => ({
      ok: true,
      rows: (await getAllClassesMock()) ?? [],
      error: null,
    }),
  },
  replicatedTrialsTable: {
    getTrialsByShow: getTrialsByShowMock,
    getByShowWithStatus: async () => ({
      ok: true,
      rows: (((await getTrialsByShowMock('show-1')) ?? []) as Array<Record<string, unknown>>).map(
        row => ({
          showId: 'show-1',
          ...row,
        })
      ),
      error: null,
    }),
  },
  replicatedJudgeAssignmentsTable: {
    getByShowId: getJudgeAssignmentsByShowMock,
    getByShowWithStatus: async () => ({
      ok: true,
      rows: (await getJudgeAssignmentsByShowMock()) ?? [],
      error: null,
    }),
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
        paymentReceivedOn: null,
        // MYK9-677 (Codex round 9): this entry is still pending, so nothing
        // has been received and no received date is written, even the one
        // typed; the ledger would otherwise date a later payment by it.
        payment_received_on: null,
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

  // MYK9-774: a dog's pending registration writes now read through
  // getAllOrThrow. The reads for every dog run before anything is queued, so a
  // failed read for the second dog cannot leave the first dog's armband and
  // entries queued behind an error the desk would retry into duplicates.
  it("queues nothing when a later dog's pending-write read fails", async () => {
    getAllClassesMock.mockResolvedValue([{ id: 'class-1', trialId: 'trial-1', maxEntries: 10 }]);
    getPendingRegistrationMutationIdsForDogMock.mockImplementation(async (dogId: string) => {
      if (dogId === 'dog-2') {
        throw new Error("This device couldn't read its saved show data. Try again.");
      }
      return [];
    });

    await expect(
      submitOfflineLateEntry({
        showId: 'show-1',
        paymentMethod: 'cash',
        showFeeInfo: { preEntryFee: '25', dayOfShowFee: '35', startDate: '2026-07-01' },
        classes: [{ id: 'class-1', entryFee: 30 }],
        classSelections: [
          { dogId: 'dog-1', trialId: 'trial-1', selectedClasses: [{ classId: 'class-1' }] },
          { dogId: 'dog-2', trialId: 'trial-1', selectedClasses: [{ classId: 'class-1' }] },
        ],
        handlerAssignments: {},
      })
    ).rejects.toThrow(/couldn't read its saved show data/);

    expect(upsertAssignedArmbandMock).not.toHaveBeenCalled();
    expect(createEntryMock).not.toHaveBeenCalled();
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

  describe('Secretary Payment (Already Received) at the desk (MYK9-677)', () => {
    const base = {
      showId: 'show-1',
      paymentMethod: 'secretary_paid' as const,
      showFeeInfo: { preEntryFee: '25', dayOfShowFee: '35', startDate: '2026-07-01' },
      classes: [{ id: 'class-1', entryFee: 30 }],
      classSelections: [
        { dogId: 'dog-1', trialId: 'trial-1', selectedClasses: [{ classId: 'class-1' }] },
      ],
      handlerAssignments: {},
    };

    it('writes the entry as paid by the method received, which the server ledger trigger reads on sync', async () => {
      await submitOfflineLateEntry({
        ...base,
        paymentDetails: { receivedMethod: 'check', paymentDate: '2026-06-30', checkNumber: '881' },
      });

      expect(createEntryMock).toHaveBeenCalledTimes(1);
      expect(createEntryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentMethod: 'check',
          paymentStatus: 'paid',
          payment_received_on: '2026-06-30',
          payment_reference: '881',
        }),
        expect.anything()
      );
    });

    it('refuses money received with no method before writing anything', async () => {
      await expect(submitOfflineLateEntry({ ...base, paymentDetails: {} })).rejects.toThrow(
        'Choose whether the payment was received as cash or check.'
      );

      expect(createEntryMock).not.toHaveBeenCalled();
      expect(upsertAssignedArmbandMock).not.toHaveBeenCalled();
    });

    it('keeps the secretary_paid label on a $0 entry, which no ledger row is for', async () => {
      await submitOfflineLateEntry({
        ...base,
        showFeeInfo: { preEntryFee: '0', dayOfShowFee: '0', startDate: '2026-07-01' },
        classes: [{ id: 'class-1', entryFee: 0 }],
      });

      expect(createEntryMock).toHaveBeenCalledWith(
        expect.objectContaining({ paymentMethod: 'secretary_paid', entryFee: 0 }),
        expect.anything()
      );
    });
  });

  it('starts local armband reservations from the cached show start number', async () => {
    getShowByIdMock.mockResolvedValue({ id: 'show-1', startingArmbandNumber: 250 });
    getArmbandsByShowMock.mockResolvedValue([]);

    const result = await submitOfflineLateEntry({
      showId: 'show-1',
      paymentMethod: 'secretary_paid',
      paymentDetails: { receivedMethod: 'cash' },
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
  it('records a pre-entry as a pre-entry: entries still open, show not started (MYK9-642)', async () => {
    // The late-entry dialog used to hardcode `isDayOfShow: true`, so a
    // secretary keying a mailed-in form the week before the show certified it
    // to the registry as a day-of-show entry. The bucket is the shared rule's
    // to decide, and it must agree with the fee this same call writes.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T16:00:00Z'));
    try {
      await submitOfflineLateEntry({
        showId: 'show-1',
        paymentMethod: 'check',
        showFeeInfo: {
          preEntryFee: '30',
          dayOfShowFee: '35',
          startDate: '2026-09-17T00:00:00+00:00',
          entryCloseDate: '2026-09-10T00:00:00+00:00',
          entryWindowTimezone: 'America/New_York',
        },
        classes: [{ id: 'class-1', entryFee: 30 }],
        classSelections: [
          { dogId: 'dog-1', trialId: 'trial-1', selectedClasses: [{ classId: 'class-1' }] },
        ],
        handlerAssignments: {},
      });
    } finally {
      vi.useRealTimers();
    }

    expect(createEntryMock).toHaveBeenCalledWith(
      expect.objectContaining({ isDayOfShow: false, entryFee: 30 }),
      expect.anything()
    );
  });
  it('a Central-time desk entry the evening before the show is a pre-entry (MYK9-642 J-F1)', async () => {
    // The offline desk path writes `entry_fee` and `is_day_of_show` straight
    // through replication — no server corrects it. Fed the America/New_York
    // fallback (which is what `show.trials` always resolved to) this instant
    // stored $35 / day-of for an entry `submit_show_entries` calls a $30
    // pre-entry. Fed the show's real zone, the two agree.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-07T05:30:00Z')); // 23:30 CT on Nov 6
    try {
      await submitOfflineLateEntry({
        showId: 'show-1',
        paymentMethod: 'check',
        showFeeInfo: {
          preEntryFee: '30',
          dayOfShowFee: '35',
          startDate: '2026-11-07T00:00:00+00:00',
          entryCloseDate: '2026-12-01T00:00:00+00:00',
          entryWindowTimezone: 'America/Chicago',
        },
        classes: [{ id: 'class-1', entryFee: 30 }],
        classSelections: [
          { dogId: 'dog-1', trialId: 'trial-1', selectedClasses: [{ classId: 'class-1' }] },
        ],
        handlerAssignments: {},
      });
    } finally {
      vi.useRealTimers();
    }

    expect(createEntryMock).toHaveBeenCalledWith(
      expect.objectContaining({ isDayOfShow: false, entryFee: 30 }),
      expect.anything()
    );
  });

  it('stamps a desk payment received today on the show calendar (MYK9-677)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-08T04:30:00Z')); // 22:30 CT on Nov 7, show day
    try {
      await submitOfflineLateEntry({
        showId: 'show-1',
        paymentMethod: 'cash',
        paymentStatus: PaymentStatus.PAID_BY_CASH,
        paymentDetails: { paymentDate: '' },
        showFeeInfo: {
          preEntryFee: '30',
          dayOfShowFee: '35',
          startDate: '2026-11-07T00:00:00+00:00',
          entryWindowTimezone: 'America/Chicago',
        },
        classes: [{ id: 'class-1', entryFee: 30 }],
        classSelections: [
          { dogId: 'dog-1', trialId: 'trial-1', selectedClasses: [{ classId: 'class-1' }] },
        ],
        handlerAssignments: {},
      });
    } finally {
      vi.useRealTimers();
    }

    expect(createEntryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentStatus: 'paid',
        paymentReceivedOn: '2026-11-07',
        payment_received_on: '2026-11-07',
      }),
      expect.anything()
    );
  });

  it('writes no received date for a pending entry even when a date was typed (MYK9-677)', async () => {
    // The ledger dates a later payment by this column; a date typed while the
    // money was still due would place it on a day it was not received.
    await submitOfflineLateEntry({
      showId: 'show-1',
      paymentMethod: 'check',
      paymentDetails: { paymentDate: '2026-06-30' },
      showFeeInfo: { preEntryFee: '25', dayOfShowFee: '35', startDate: '2026-07-01' },
      classes: [{ id: 'class-1', entryFee: 30 }],
      classSelections: [
        { dogId: 'dog-1', trialId: 'trial-1', selectedClasses: [{ classId: 'class-1' }] },
      ],
      handlerAssignments: {},
    });

    expect(createEntryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentStatus: 'pending',
        paymentReceivedOn: null,
        payment_received_on: null,
      }),
      expect.anything()
    );
  });

  it('keeps the typed received date for an entry paid at submission', async () => {
    await submitOfflineLateEntry({
      showId: 'show-1',
      paymentMethod: 'check',
      paymentStatus: PaymentStatus.PAID_BY_CHECK,
      paymentDetails: { paymentDate: '2026-06-30' },
      showFeeInfo: { preEntryFee: '25', dayOfShowFee: '35', startDate: '2026-07-01' },
      classes: [{ id: 'class-1', entryFee: 30 }],
      classSelections: [
        { dogId: 'dog-1', trialId: 'trial-1', selectedClasses: [{ classId: 'class-1' }] },
      ],
      handlerAssignments: {},
    });

    expect(createEntryMock).toHaveBeenCalledWith(
      expect.objectContaining({ paymentStatus: 'paid', payment_received_on: '2026-06-30' }),
      expect.anything()
    );
  });

  it('leaves the received date empty for a desk entry whose payment is still due', async () => {
    await submitOfflineLateEntry({
      showId: 'show-1',
      paymentMethod: 'check',
      showFeeInfo: { preEntryFee: '25', dayOfShowFee: '35', startDate: '2026-07-01' },
      classes: [{ id: 'class-1', entryFee: 30 }],
      classSelections: [
        { dogId: 'dog-1', trialId: 'trial-1', selectedClasses: [{ classId: 'class-1' }] },
      ],
      handlerAssignments: {},
    });

    expect(createEntryMock).toHaveBeenCalledWith(
      expect.objectContaining({ paymentStatus: 'pending', payment_received_on: null }),
      expect.anything()
    );
  });
});
