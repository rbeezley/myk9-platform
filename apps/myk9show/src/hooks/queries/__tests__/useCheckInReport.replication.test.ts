import { vi } from 'vitest';

const replicationMocks = vi.hoisted(() => ({
  getEntriesByShow: vi.fn(),
  getClassById: vi.fn(),
  getDogById: vi.fn(),
  getTrialsByShow: vi.fn(),
  getArmbandsByShow: vi.fn(),
}));

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

const cacheMocks = vi.hoisted(() => ({
  bulkGet: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: (...args: unknown[]) => supabaseMocks.from(...args),
  },
}));

vi.mock('@/services/database/connection', () => ({
  db: { instance: { people: { bulkGet: (...args: unknown[]) => cacheMocks.bulkGet(...args) } } },
}));

vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: {
    getEntriesByShow: (...args: unknown[]) => replicationMocks.getEntriesByShow(...args),
  },
  replicatedClassesTable: {
    getClassById: (...args: unknown[]) => replicationMocks.getClassById(...args),
  },
  replicatedDogsTable: {
    getDogById: (...args: unknown[]) => replicationMocks.getDogById(...args),
  },
  replicatedTrialsTable: {
    getTrialsByShow: (...args: unknown[]) => replicationMocks.getTrialsByShow(...args),
  },
  replicatedArmbandsTable: {
    getByShow: (...args: unknown[]) => replicationMocks.getArmbandsByShow(...args),
  },
}));

describe('fetchReplicatedCheckInEntries', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    supabaseMocks.from.mockReset();
    cacheMocks.bulkGet.mockResolvedValue([]);
    replicationMocks.getDogById.mockResolvedValue(null);
  });

  it('builds the check-in report rows from replicated show-day tables', async () => {
    replicationMocks.getEntriesByShow.mockResolvedValue([
      {
        id: 'entry-1',
        showId: 'show-1',
        dogId: 'dog-1',
        handlerId: 'handler-1',
        handler: 'Sarah Mitchell',
        dogCallName: 'Buddy',
        dogBreed: 'Golden Retriever',
        classId: 'class-1',
        checkInStatus: 'checked-in',
      },
      {
        id: 'entry-2',
        showId: 'show-1',
        dogId: 'dog-1',
        handlerId: 'handler-1',
        handler: 'Sarah Mitchell',
        dogCallName: 'Buddy',
        dogBreed: 'Golden Retriever',
        classId: 'class-2',
        checkInStatus: 'no-status',
      },
      {
        id: 'deleted-entry',
        showId: 'show-1',
        dogId: 'dog-2',
        handlerId: 'handler-2',
        classId: 'class-1',
        deletedAt: '2026-06-01T00:00:00.000Z',
      },
    ]);
    replicationMocks.getClassById.mockImplementation((classId: string) =>
      Promise.resolve(
        classId === 'class-1'
          ? {
              id: 'class-1',
              trialId: 'trial-1',
              element: 'Buried',
              level: 'Novice',
              section: 'A',
            }
          : {
              id: 'class-2',
              trialId: 'trial-2',
              element: 'Interior',
              level: 'Advanced',
              section: 'B',
            }
      )
    );
    replicationMocks.getTrialsByShow.mockResolvedValue([
      { id: 'trial-1', date: '2026-04-12', trialNumber: '1' },
      { id: 'trial-2', date: '2026-04-13', trialNumber: '2' },
    ]);
    replicationMocks.getArmbandsByShow.mockResolvedValue([
      {
        id: 'armband-1',
        showId: 'show-1',
        dogId: 'dog-1',
        armbandNumber: '12A',
        isAvailable: false,
      },
    ]);

    const { fetchReplicatedCheckInEntries } = await import('../useCheckInReportReplication');

    const rows = await fetchReplicatedCheckInEntries('show-1');

    expect(replicationMocks.getEntriesByShow).toHaveBeenCalledWith('show-1');
    expect(replicationMocks.getTrialsByShow).toHaveBeenCalledWith('show-1');
    expect(replicationMocks.getArmbandsByShow).toHaveBeenCalledWith('show-1');
    expect(replicationMocks.getClassById).toHaveBeenCalledTimes(2);
    expect(supabaseMocks.from).not.toHaveBeenCalled();
    expect(rows).toEqual([
      {
        id: 'entry-1',
        dog_id: 'dog-1',
        handler_id: 'handler-1',
        check_in_status: 'checked-in',
        armband_number: '12A',
        handler_first_name: 'Sarah',
        handler_last_name: 'Mitchell',
        dog_call_name: 'Buddy',
        dog_breed_name: 'Golden Retriever',
        class_id: 'class-1',
        element: 'Buried',
        level: 'Novice',
        section: 'A',
        trial_id: 'trial-1',
        trial_date: '2026-04-12',
        trial_number: 1,
      },
      {
        id: 'entry-2',
        dog_id: 'dog-1',
        handler_id: 'handler-1',
        check_in_status: 'no-status',
        armband_number: '12A',
        handler_first_name: 'Sarah',
        handler_last_name: 'Mitchell',
        dog_call_name: 'Buddy',
        dog_breed_name: 'Golden Retriever',
        class_id: 'class-2',
        element: 'Interior',
        level: 'Advanced',
        section: 'B',
        trial_id: 'trial-2',
        trial_date: '2026-04-13',
        trial_number: 2,
      },
    ]);
  });

  it('ignores armbands that are not explicitly assigned', async () => {
    replicationMocks.getEntriesByShow.mockResolvedValue([
      {
        id: 'entry-1',
        showId: 'show-1',
        dogId: 'dog-1',
        handlerId: 'handler-1',
        handler: 'Cher',
        dogCallName: 'Buddy',
        classId: 'class-1',
      },
    ]);
    replicationMocks.getClassById.mockResolvedValue({
      id: 'class-1',
      trialId: 'trial-1',
      element: 'Buried',
      level: 'Novice',
    });
    replicationMocks.getTrialsByShow.mockResolvedValue([
      { id: 'trial-1', date: '2026-04-12', trialNumber: '1' },
    ]);
    replicationMocks.getArmbandsByShow.mockResolvedValue([
      {
        id: 'pool-armband',
        showId: 'show-1',
        dogId: 'dog-1',
        armbandNumber: '999',
        isAvailable: undefined,
      },
    ]);

    const { fetchReplicatedCheckInEntries } = await import('../useCheckInReportReplication');

    const rows = await fetchReplicatedCheckInEntries('show-1');

    expect(rows[0].armband_number).toBeNull();
    expect(rows[0].handler_first_name).toBe('Cher');
    expect(rows[0].handler_last_name).toBeNull();
  });

  it('hydrates an assigned handler when the replicated row has only handler_id', async () => {
    replicationMocks.getEntriesByShow.mockResolvedValue([
      {
        id: 'entry-handler-only',
        showId: 'show-1',
        dogId: 'dog-1',
        handlerId: 'handler-1',
        handler: null,
        dogCallName: 'Buddy',
        classId: 'class-1',
        checkInStatus: 'no-status',
      },
    ]);
    replicationMocks.getClassById.mockResolvedValue({
      id: 'class-1',
      trialId: 'trial-1',
      element: 'Buried',
      level: 'Novice',
    });
    replicationMocks.getTrialsByShow.mockResolvedValue([
      { id: 'trial-1', date: '2026-04-12', trialNumber: '1' },
    ]);
    replicationMocks.getArmbandsByShow.mockResolvedValue([]);
    supabaseMocks.from.mockReturnValue({
      select: () => ({
        in: () =>
          Promise.resolve({
            data: [{ id: 'handler-1', first_name: 'Alex', last_name: 'Assigned' }],
            error: null,
          }),
      }),
    });

    const { fetchReplicatedCheckInEntries } = await import('../useCheckInReportReplication');

    const rows = await fetchReplicatedCheckInEntries('show-1');

    expect(rows[0]).toMatchObject({
      handler_id: 'handler-1',
      handler_first_name: 'Alex',
      handler_last_name: 'Assigned',
    });
  });

  it('uses a cached person for handler_id-only rows without an online read', async () => {
    replicationMocks.getEntriesByShow.mockResolvedValue([
      {
        id: 'entry-handler-cached',
        showId: 'show-1',
        dogId: 'dog-1',
        handlerId: 'handler-cached',
        handler: null,
        dogCallName: 'Buddy',
        classId: 'class-1',
      },
    ]);
    replicationMocks.getClassById.mockResolvedValue({
      id: 'class-1',
      trialId: 'trial-1',
      element: 'Buried',
      level: 'Novice',
    });
    replicationMocks.getTrialsByShow.mockResolvedValue([
      { id: 'trial-1', date: '2026-04-12', trialNumber: '1' },
    ]);
    replicationMocks.getArmbandsByShow.mockResolvedValue([]);
    cacheMocks.bulkGet.mockResolvedValue([
      { id: 'handler-cached', firstName: 'Offline', lastName: 'Assigned' },
    ]);

    const { fetchReplicatedCheckInEntries } = await import('../useCheckInReportReplication');

    const rows = await fetchReplicatedCheckInEntries('show-1');

    expect(rows[0]).toMatchObject({
      handler_id: 'handler-cached',
      handler_first_name: 'Offline',
      handler_last_name: 'Assigned',
    });
  });

  it('uses the replicated dog owner when the entry has no handler assignment', async () => {
    replicationMocks.getEntriesByShow.mockResolvedValue([
      {
        id: 'entry-owner-handled',
        showId: 'show-1',
        dogId: 'dog-owner',
        handlerId: undefined,
        handler: null,
        dogCallName: 'Buddy',
        classId: 'class-1',
      },
    ]);
    replicationMocks.getDogById.mockResolvedValue({
      id: 'dog-owner',
      ownerId: 'owner-1',
      name: 'Buddy',
      breed: 'Golden Retriever',
    });
    replicationMocks.getClassById.mockResolvedValue({
      id: 'class-1',
      trialId: 'trial-1',
      element: 'Buried',
      level: 'Novice',
    });
    replicationMocks.getTrialsByShow.mockResolvedValue([
      { id: 'trial-1', date: '2026-04-12', trialNumber: '1' },
    ]);
    replicationMocks.getArmbandsByShow.mockResolvedValue([]);
    cacheMocks.bulkGet.mockResolvedValue([
      { id: 'owner-1', firstName: 'Owner', lastName: 'Fallback' },
    ]);

    const { fetchReplicatedCheckInEntries } = await import('../useCheckInReportReplication');

    const rows = await fetchReplicatedCheckInEntries('show-1');

    expect(rows[0]).toMatchObject({
      handler_id: '',
      handler_first_name: 'Owner',
      handler_last_name: 'Fallback',
    });
  });

  it('refreshes a stale cached handler name when online data is available', async () => {
    replicationMocks.getEntriesByShow.mockResolvedValue([
      {
        id: 'entry-handler-renamed',
        showId: 'show-1',
        dogId: 'dog-1',
        handlerId: 'handler-renamed',
        handler: null,
        dogCallName: 'Buddy',
        classId: 'class-1',
      },
    ]);
    replicationMocks.getClassById.mockResolvedValue({
      id: 'class-1',
      trialId: 'trial-1',
      element: 'Buried',
      level: 'Novice',
    });
    replicationMocks.getTrialsByShow.mockResolvedValue([
      { id: 'trial-1', date: '2026-04-12', trialNumber: '1' },
    ]);
    replicationMocks.getArmbandsByShow.mockResolvedValue([]);
    cacheMocks.bulkGet.mockResolvedValue([
      { id: 'handler-renamed', firstName: 'Old', lastName: 'Name' },
    ]);
    supabaseMocks.from.mockReturnValue({
      select: () => ({
        in: () =>
          Promise.resolve({
            data: [{ id: 'handler-renamed', first_name: 'New', last_name: 'Name' }],
            error: null,
          }),
      }),
    });

    const { fetchReplicatedCheckInEntries } = await import('../useCheckInReportReplication');

    const rows = await fetchReplicatedCheckInEntries('show-1');

    expect(rows[0]).toMatchObject({
      handler_first_name: 'New',
      handler_last_name: 'Name',
    });
  });
});
