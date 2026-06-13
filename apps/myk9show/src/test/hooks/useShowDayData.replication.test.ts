import { vi } from 'vitest';

const replicationMocks = vi.hoisted(() => ({
  getAllEntries: vi.fn(),
  getDogById: vi.fn(),
  getClassById: vi.fn(),
  getTrialById: vi.fn(),
  getShowById: vi.fn(),
  getClubById: vi.fn(),
}));

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: (...args: unknown[]) => supabaseMocks.from(...args),
  },
}));

vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: {
    getAll: (...args: unknown[]) => replicationMocks.getAllEntries(...args),
  },
  replicatedDogsTable: {
    getDogById: (...args: unknown[]) => replicationMocks.getDogById(...args),
  },
  replicatedClassesTable: {
    getClassById: (...args: unknown[]) => replicationMocks.getClassById(...args),
  },
  replicatedTrialsTable: {
    getTrialById: (...args: unknown[]) => replicationMocks.getTrialById(...args),
  },
  replicatedShowsTable: {
    getShowById: (...args: unknown[]) => replicationMocks.getShowById(...args),
  },
  replicatedClubsTable: {
    getClubById: (...args: unknown[]) => replicationMocks.getClubById(...args),
  },
}));

describe('show-day data replication adapter', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('builds exhibitor show-day check, details, and ring progress from replicas', async () => {
    replicationMocks.getAllEntries.mockResolvedValue([
      {
        id: 'my-entry',
        handlerId: 'user-1',
        showId: 'show-1',
        trialId: 'trial-1',
        classId: 'class-1',
        dogId: 'dog-1',
        checkInStatus: 'checked-in',
        armband: '160',
        runOrder: 5,
        isScored: false,
        resultStatus: 'pending',
        isInRing: false,
      },
      {
        id: 'ring-entry',
        handlerId: 'other-user',
        showId: 'show-1',
        trialId: 'trial-1',
        classId: 'class-1',
        dogId: 'dog-2',
        runOrder: 4,
        isScored: true,
        isInRing: true,
        scoringCompletedAt: '2026-03-09T10:05:00Z',
      },
      {
        id: 'tomorrow-entry',
        handlerId: 'user-1',
        showId: 'show-2',
        trialId: 'trial-2',
        classId: 'class-2',
        dogId: 'dog-1',
      },
      {
        id: 'deleted-entry',
        handlerId: 'user-1',
        showId: 'show-1',
        trialId: 'trial-1',
        classId: 'class-1',
        dogId: 'dog-1',
        deletedAt: '2026-03-01T00:00:00.000Z',
      },
    ]);
    replicationMocks.getDogById.mockImplementation((dogId: string) =>
      Promise.resolve(
        dogId === 'dog-1'
          ? { id: 'dog-1', name: 'Storm Watch', callName: 'Storm', breed: 'Border Collie' }
          : { id: 'dog-2', name: 'Ace High', callName: 'Ace', breed: 'Beagle' }
      )
    );
    replicationMocks.getClassById.mockImplementation((classId: string) =>
      Promise.resolve(
        classId === 'class-1'
          ? {
              id: 'class-1',
              trialId: 'trial-1',
              name: 'Container Novice A',
              element: 'Container',
              level: 'Novice',
              classStatus: 'in-progress',
              totalEntriesCount: 12,
              scoredCount: 3,
            }
          : {
              id: 'class-2',
              trialId: 'trial-2',
              name: 'Interior Novice A',
              element: 'Interior',
              level: 'Novice',
            }
      )
    );
    replicationMocks.getTrialById.mockImplementation((trialId: string) =>
      Promise.resolve(
        trialId === 'trial-1'
          ? { id: 'trial-1', showId: 'show-1', date: '2026-03-09', trialNumber: '1' }
          : { id: 'trial-2', showId: 'show-2', date: '2026-03-10', trialNumber: '1' }
      )
    );
    replicationMocks.getShowById.mockImplementation((showId: string) =>
      Promise.resolve(
        showId === 'show-1'
          ? {
              id: 'show-1',
              name: 'AKC Scent Work Trial',
              location: 'Denver, CO',
              status: 'in_progress',
              startDate: '2026-03-09',
              endDate: '2026-03-09',
              clubId: 'club-1',
            }
          : {
              id: 'show-2',
              name: 'Tomorrow Trial',
              location: 'Boulder, CO',
              status: 'published',
              startDate: '2026-03-10',
              endDate: '2026-03-10',
              clubId: 'club-2',
            }
      )
    );
    replicationMocks.getClubById.mockImplementation((clubId: string) =>
      Promise.resolve(clubId === 'club-1' ? { id: 'club-1', name: 'Mile High Club' } : null)
    );

    const {
      fetchReplicatedRingProgress,
      fetchReplicatedShowDayCheck,
      fetchReplicatedShowDayDetails,
    } = await import('@/hooks/queries/showDayDataReplication');

    const checkRows = await fetchReplicatedShowDayCheck('user-1', '2026-03-09');
    const detailRows = await fetchReplicatedShowDayDetails('user-1', '2026-03-09');
    const progressRows = await fetchReplicatedRingProgress(['class-1']);

    expect(supabaseMocks.from).not.toHaveBeenCalled();
    expect(checkRows).toEqual([
      {
        id: 'my-entry',
        trial: {
          id: 'trial-1',
          date: '2026-03-09',
          show: {
            id: 'show-1',
            name: 'AKC Scent Work Trial',
            location: 'Denver, CO',
            status: 'in_progress',
            start_date: '2026-03-09',
            end_date: '2026-03-09',
            club: { name: 'Mile High Club' },
          },
        },
      },
    ]);
    expect(detailRows).toEqual([
      {
        id: 'my-entry',
        check_in_status: 'checked-in',
        armband: '160',
        run_order: 5,
        is_scored: false,
        result_status: 'pending',
        is_in_ring: false,
        dog: { id: 'dog-1', call_name: 'Storm' },
        class: {
          id: 'class-1',
          name: 'Container Novice A',
          element: 'Container',
          level: 'Novice',
          status: 'in-progress',
          total_entries_count: 12,
          scored_count: 3,
        },
        trial: {
          id: 'trial-1',
          date: '2026-03-09',
          show: {
            id: 'show-1',
            name: 'AKC Scent Work Trial',
            location: 'Denver, CO',
            status: 'in_progress',
            club: { name: 'Mile High Club' },
          },
        },
      },
    ]);
    expect(progressRows).toEqual([
      {
        class_id: 'class-1',
        is_in_ring: true,
        is_scored: true,
        scoring_completed_at: '2026-03-09T10:05:00Z',
        run_order: 4,
        dog: { call_name: 'Ace' },
      },
    ]);
  });

  it('supports snake_case entry fields and sorts uncompleted ring rows last', async () => {
    replicationMocks.getAllEntries.mockResolvedValue([
      {
        id: 'snake-user-entry',
        handler_id: 'user-1',
        showId: 'show-1',
        trial_id: 'trial-1',
        class_id: 'class-1',
        dogId: 'dog-1',
        check_in_status: 'checked-in',
        armband: '161',
        run_order: 7,
        is_scored: false,
        is_in_ring: false,
      },
      {
        id: 'scored-entry',
        handler_id: 'other-user',
        showId: 'show-1',
        trial_id: 'trial-1',
        class_id: 'class-1',
        dogId: 'dog-2',
        run_order: 2,
        is_scored: true,
        is_in_ring: false,
        scoring_completed_at: '2026-03-09T10:05:00Z',
      },
      {
        id: 'in-ring-entry',
        handler_id: 'other-user',
        showId: 'show-1',
        trial_id: 'trial-1',
        class_id: 'class-1',
        dogId: 'dog-3',
        run_order: 3,
        is_scored: false,
        is_in_ring: true,
        scoring_completed_at: null,
      },
    ]);
    replicationMocks.getDogById.mockImplementation((dogId: string) =>
      Promise.resolve({
        id: dogId,
        name: `${dogId} Registered`,
        callName: dogId === 'dog-1' ? 'Storm' : dogId === 'dog-2' ? 'Ace' : 'Beacon',
        breed: 'Mixed',
      })
    );
    replicationMocks.getClassById.mockResolvedValue({
      id: 'class-1',
      trialId: 'trial-1',
      name: 'Container Novice A',
      element: 'Container',
      level: 'Novice',
      classStatus: 'in-progress',
      totalEntriesCount: 12,
      scoredCount: 3,
    });
    replicationMocks.getTrialById.mockResolvedValue({
      id: 'trial-1',
      showId: 'show-1',
      date: '2026-03-09',
      trialNumber: '1',
    });
    replicationMocks.getShowById.mockResolvedValue({
      id: 'show-1',
      name: 'AKC Scent Work Trial',
      location: 'Denver, CO',
      status: 'in_progress',
      startDate: '2026-03-09',
      endDate: '2026-03-09',
      clubId: 'club-1',
    });
    replicationMocks.getClubById.mockResolvedValue({ id: 'club-1', name: 'Mile High Club' });

    const {
      fetchReplicatedRingProgress,
      fetchReplicatedShowDayCheck,
      fetchReplicatedShowDayDetails,
    } = await import('@/hooks/queries/showDayDataReplication');

    const checkRows = await fetchReplicatedShowDayCheck('user-1', '2026-03-09');
    const detailRows = await fetchReplicatedShowDayDetails('user-1', '2026-03-09');
    const progressRows = await fetchReplicatedRingProgress(['class-1']);

    expect(checkRows.map(row => row.id)).toEqual(['snake-user-entry']);
    expect(detailRows[0]).toMatchObject({
      id: 'snake-user-entry',
      check_in_status: 'checked-in',
      run_order: 7,
    });
    expect(progressRows.map(row => row.dog.call_name)).toEqual(['Ace', 'Beacon']);
    expect(progressRows.map(row => row.run_order)).toEqual([2, 3]);
  });
});
