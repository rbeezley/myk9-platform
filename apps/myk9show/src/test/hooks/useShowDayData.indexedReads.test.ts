import { vi } from 'vitest';

type Row = Record<string, unknown>;

const mocks = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  getAllOrThrow: vi.fn(),
  getByClassOrThrow: vi.fn(),
  getByTrialOrThrow: vi.fn(),
  getTrialsByDate: vi.fn(),
  getClassesByTrial: vi.fn(),
}));

vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: {
    getAllOrThrow: (...args: unknown[]) => mocks.getAllOrThrow(...args),
    getByClassOrThrow: (...args: unknown[]) => mocks.getByClassOrThrow(...args),
    getByTrialOrThrow: (...args: unknown[]) => mocks.getByTrialOrThrow(...args),
  },
  replicatedTrialsTable: {
    getTrialsByDate: (...args: unknown[]) => mocks.getTrialsByDate(...args),
    getTrialById: async (id: string) =>
      id === 'trial-1' ? { id, showId: 'show-1', date: '2026-03-09' } : null,
  },
  replicatedClassesTable: {
    getClassesByTrial: (...args: unknown[]) => mocks.getClassesByTrial(...args),
    getClassById: async (id: string) => ({ id, trialId: 'trial-1', name: id }),
  },
  replicatedDogsTable: {
    getDogById: async (id: string) => ({ id, name: id, callName: id }),
  },
  replicatedShowsTable: {
    getShowById: async (id: string) => ({ id, name: 'Show', startDate: '', endDate: '' }),
  },
  replicatedClubsTable: { getClubById: async () => null },
}));

const mine = (id: string, extra: Row = {}): Row => ({
  id,
  handlerId: 'user-1',
  classId: 'class-1',
  trialId: 'trial-1',
  dogId: 'dog-1',
  ...extra,
});

describe('show-day replica reads are indexed (MYK9-1368)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.rows = [
      mine('b-entry', { runOrder: 2 }),
      mine('a-entry', { runOrder: 2, isInRing: true }),
      // no trialId: resolves through its class
      mine('c-no-trial', { trialId: undefined, runOrder: 1 }),
      mine('deleted', { deletedAt: '2026-03-01T00:00:00Z' }),
      mine('other-handler', { handlerId: 'someone' }),
      // an unrelated show's rows
      mine('unrelated', { classId: 'class-9', trialId: 'trial-9' }),
    ];
    mocks.getAllOrThrow.mockImplementation(async () => mocks.rows);
    mocks.getByClassOrThrow.mockImplementation(async (id: string) =>
      mocks.rows.filter(r => r.classId === id)
    );
    mocks.getByTrialOrThrow.mockImplementation(async (id: string) =>
      mocks.rows.filter(r => r.trialId === id)
    );
    mocks.getTrialsByDate.mockResolvedValue([{ id: 'trial-1', date: '2026-03-09' }]);
    mocks.getClassesByTrial.mockResolvedValue([{ id: 'class-1', trialId: 'trial-1' }]);
  });

  it('never scans the whole entries table and never reads an unrelated class or trial', async () => {
    const m = await import('@/hooks/queries/showDayDataReplication');
    const check = await m.fetchReplicatedShowDayCheck('user-1', '2026-03-09');
    const details = await m.fetchReplicatedShowDayDetails('user-1', '2026-03-09');
    const progress = await m.fetchReplicatedRingProgress(['class-1']);

    expect(mocks.getAllOrThrow).not.toHaveBeenCalled();
    const scoped = [...mocks.getByClassOrThrow.mock.calls, ...mocks.getByTrialOrThrow.mock.calls];
    expect(scoped.map(c => c[0]).every(id => id === 'class-1' || id === 'trial-1')).toBe(true);
    // Entries without a trialId are found through their class.
    expect(check.map(r => r.id)).toEqual(['a-entry', 'b-entry', 'c-no-trial']);
    // Same sort as before: run_order, stable over id order.
    expect(details.map(r => r.id)).toEqual(['c-no-trial', 'a-entry', 'b-entry']);
    expect(progress.map(r => r.class_id)).toEqual(['class-1']);
  });

  it('reads each distinct ring-progress class once and not at all for an empty list', async () => {
    const m = await import('@/hooks/queries/showDayDataReplication');
    await m.fetchReplicatedRingProgress(['class-1', 'class-1']);
    expect(mocks.getByClassOrThrow).toHaveBeenCalledTimes(1);
    expect(await m.fetchReplicatedRingProgress([])).toEqual([]);
    expect(mocks.getByClassOrThrow).toHaveBeenCalledTimes(1);
  });

  it('still rejects when a scoped read fails', async () => {
    const m = await import('@/hooks/queries/showDayDataReplication');
    mocks.getByClassOrThrow.mockRejectedValue(new Error('replica unreadable'));
    await expect(m.fetchReplicatedShowDayCheck('user-1', '2026-03-09')).rejects.toThrow(
      'replica unreadable'
    );
    await expect(m.fetchReplicatedShowDayDetails('user-1', '2026-03-09')).rejects.toThrow(
      'replica unreadable'
    );
    await expect(m.fetchReplicatedRingProgress(['class-1'])).rejects.toThrow('replica unreadable');
  });
});
