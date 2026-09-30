import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  JUNIOR_FEE_OVERRIDE_REQUEST,
  submitOfflineLateEntry,
  type SubmitOfflineLateEntryParams,
} from './submitOfflineLateEntry';

/**
 * MYK9-878: the offline late-entry path carries the secretary's "charge junior
 * handler fee" choice. The junior fee for an owner who is a junior is decided by
 * the server when the queued insert lands (trg_entries_junior_fee); the client
 * only knows the explicit override, so that is all it prices or flags.
 */

const { createEntryMock } = vi.hoisted(() => ({ createEntryMock: vi.fn() }));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    getSyncMetadata: async () => ({ tableName: 'entries', totalRows: 1 }),
  },
}));

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
    getByShowWithStatus: async () => ({ ok: true, rows: [], error: null }),
  },
  replicatedDogsTable: { getPendingMutationIdsForRow: async () => [] },
  replicatedDogRegistrationsTable: { getPendingMutationIdsForDog: async () => [] },
  replicatedShowsTable: {
    getShowById: async () => ({ id: 'show-1', startingArmbandNumber: 100 }),
  },
  replicatedClassesTable: {
    getAll: async () => [{ id: 'class-1', trialId: 'trial-1', maxEntries: 10 }],
    getAllOrThrow: async () => [{ id: 'class-1', trialId: 'trial-1', maxEntries: 10 }],
    getAllWithStatus: async () => ({
      ok: true,
      rows: [{ id: 'class-1', trialId: 'trial-1', maxEntries: 10 }],
      error: null,
    }),
  },
  replicatedTrialsTable: {
    getTrialsByShow: async () => [{ id: 'trial-1', date: '2026-07-13' }],
    getByShowWithStatus: async () => ({
      ok: true,
      rows: [{ id: 'trial-1', showId: 'show-1', date: '2026-07-13' }],
      error: null,
    }),
  },
  replicatedJudgeAssignmentsTable: {
    getByShowId: async () => [],
    getByShowWithStatus: async () => ({ ok: true, rows: [], error: null }),
  },
  replicatedArmbandsTable: {
    getByShow: async () => [{ id: 'existing-armband', armbandNumber: '12', dogId: 'dog-1' }],
    upsertAssignedArmband: async () => 'armband-mutation-1',
    getPendingMutationIdsForRow: async () => [],
  },
}));

function params(
  overrides: Partial<SubmitOfflineLateEntryParams> & {
    juniorHandlerFee?: string | undefined;
  } = {}
): SubmitOfflineLateEntryParams {
  const { juniorHandlerFee, ...rest } = overrides;
  return {
    showId: 'show-1',
    paymentMethod: 'cash',
    // Show day: the day-of fee is the normal fee.
    showFeeInfo: {
      preEntryFee: '25',
      dayOfShowFee: '35',
      startDate: '2026-07-01',
      ...(juniorHandlerFee !== undefined ? { juniorHandlerFee } : {}),
    },
    classes: [{ id: 'class-1', entryFee: 30 }],
    classSelections: [
      { dogId: 'dog-1', trialId: 'trial-1', selectedClasses: [{ classId: 'class-1' }] },
    ],
    handlerAssignments: {
      'dog-1|class-1': { handlerId: 'handler-1', handlerName: 'Jamie Walker', isOwner: false },
    },
    paymentDetails: { receivedMethod: 'cash' },
    ...rest,
  };
}

describe('submitOfflineLateEntry junior handler fee (MYK9-878)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createEntryMock.mockImplementation(entry => Promise.resolve({ ...entry }));
  });

  it('charges the junior fee and sends the override request when the secretary chose it', async () => {
    const result = await submitOfflineLateEntry(
      params({
        juniorHandlerFee: '15',
        paymentDetails: { receivedMethod: 'cash', chargeJuniorFee: true },
      })
    );

    expect(createEntryMock).toHaveBeenCalledTimes(1);
    expect(createEntryMock.mock.calls[0]?.[0]).toMatchObject({
      entryFee: 15,
      juniorFeeOverrideBy: JUNIOR_FEE_OVERRIDE_REQUEST,
    });
    expect(result.entryOutcomes[0]?.feeCents).toBe(1500);
  });

  it('prices at the normal fee and sends no request when the secretary did not choose it', async () => {
    const result = await submitOfflineLateEntry(params({ juniorHandlerFee: '15' }));

    const entry = createEntryMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(entry.entryFee).toBe(35);
    expect('juniorFeeOverrideBy' in entry).toBe(false);
    expect(result.entryOutcomes[0]?.feeCents).toBe(3500);
  });

  it('ignores the choice on a show with no junior fee, rather than asking the server for it', async () => {
    await submitOfflineLateEntry(
      params({ paymentDetails: { receivedMethod: 'cash', chargeJuniorFee: true } })
    );

    const entry = createEntryMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(entry.entryFee).toBe(35);
    expect('juniorFeeOverrideBy' in entry).toBe(false);
  });

  it('treats a junior fee of zero as no junior tier', async () => {
    await submitOfflineLateEntry(
      params({
        juniorHandlerFee: '0',
        paymentDetails: { receivedMethod: 'cash', chargeJuniorFee: true },
      })
    );

    const entry = createEntryMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(entry.entryFee).toBe(35);
    expect('juniorFeeOverrideBy' in entry).toBe(false);
  });

  it('keeps a waived entry at zero and sends no request', async () => {
    await submitOfflineLateEntry(
      params({
        juniorHandlerFee: '15',
        paymentMethod: 'waived',
        paymentDetails: { chargeJuniorFee: true },
      })
    );

    const entry = createEntryMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(entry.entryFee).toBe(0);
    expect('juniorFeeOverrideBy' in entry).toBe(false);
  });
});
