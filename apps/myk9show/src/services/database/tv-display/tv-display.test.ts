import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockSupabase } from '@/test/mocks/supabase';

const replicationMocks = vi.hoisted(() => ({
  getShowById: vi.fn(),
  getTrialsByShow: vi.fn(),
  getClassesByTrial: vi.fn(),
  getEntriesByShow: vi.fn(),
  getAllDogs: vi.fn(),
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: mockSupabase,
  logQuery: vi.fn(),
  createDatabaseError: (error: unknown) => error,
}));

vi.mock('@/services/replication/ReplicatedShowsTable', () => ({
  replicatedShowsTable: {
    getShowById: (...args: unknown[]) => replicationMocks.getShowById(...args),
  },
}));

vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: {
    getTrialsByShow: (...args: unknown[]) => replicationMocks.getTrialsByShow(...args),
  },
}));

vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: {
    getClassesByTrial: (...args: unknown[]) => replicationMocks.getClassesByTrial(...args),
  },
}));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    getEntriesByShow: (...args: unknown[]) => replicationMocks.getEntriesByShow(...args),
  },
}));

vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: {
    getAllDogs: (...args: unknown[]) => replicationMocks.getAllDogs(...args),
  },
}));

import { getTVDisplayData, getTVDisplayResults } from '.';

const show = {
  id: 'show-1',
  name: 'Spring Trial 2026',
  startDate: '2026-04-01',
  endDate: '2026-04-02',
};

const trial = {
  id: 'trial-1',
  showId: 'show-1',
  name: 'Trial 1',
  date: '2026-04-01',
  trialNumber: '1',
};

const dog = {
  id: 'dog-1',
  name: 'Luna Star',
  callName: 'Luna',
  breed: 'Labrador',
  imageUrl: null,
};

describe('tv-display database reads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.from.mockClear();
    replicationMocks.getShowById.mockResolvedValue(show);
    replicationMocks.getTrialsByShow.mockResolvedValue([trial]);
    replicationMocks.getAllDogs.mockResolvedValue([dog]);
  });

  it('assembles active TV data from replicated show, trial, class, entry, and dog rows', async () => {
    replicationMocks.getClassesByTrial.mockResolvedValue([
      {
        id: 'class-active',
        trialId: 'trial-1',
        name: 'Novice A',
        element: 'Container',
        level: 'Novice',
        classStatus: 'in_progress',
        totalEntriesCount: 10,
        scoredCount: 3,
        startTime: '09:00',
        judgeName: 'John Smith',
      },
      {
        id: 'class-complete',
        trialId: 'trial-1',
        name: 'Complete Class',
        classStatus: 'completed',
      },
    ]);
    replicationMocks.getEntriesByShow.mockResolvedValue([
      {
        id: 'entry-next',
        showId: 'show-1',
        classId: 'class-active',
        dogId: 'dog-1',
        armband: '42',
        handler: 'J. Martinez',
        runOrder: 2,
        isInRing: false,
        isScored: false,
      },
      {
        id: 'entry-ring',
        showId: 'show-1',
        classId: 'class-active',
        dogId: 'dog-1',
        armband: '41',
        handler: 'S. Johnson',
        runOrder: 9,
        isInRing: true,
        isScored: true,
      },
      {
        id: 'entry-scored',
        showId: 'show-1',
        classId: 'class-active',
        dogId: 'dog-1',
        armband: '40',
        runOrder: 1,
        isInRing: false,
        isScored: true,
      },
    ]);

    const result = await getTVDisplayData('show-1');

    expect(mockSupabase.from).not.toHaveBeenCalled();
    expect(replicationMocks.getShowById).toHaveBeenCalledWith('show-1');
    expect(replicationMocks.getTrialsByShow).toHaveBeenCalledWith('show-1');
    expect(replicationMocks.getClassesByTrial).toHaveBeenCalledWith('trial-1');
    expect(replicationMocks.getEntriesByShow).toHaveBeenCalledWith('show-1');
    expect(result.show).toEqual({
      id: 'show-1',
      name: 'Spring Trial 2026',
      startDate: '2026-04-01',
      endDate: '2026-04-02',
    });
    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]).toMatchObject({
      id: 'class-active',
      name: 'Novice A',
      judgeName: 'John Smith',
      totalEntries: 10,
      scoredCount: 3,
      trialDate: '2026-04-01',
      trialNumber: 1,
    });
    expect(result.classes[0].entries.map(entry => entry.id)).toEqual(['entry-ring', 'entry-next']);
    expect(result.classes[0].entries[0].dog?.callName).toBe('Luna');
  });

  it('assembles completed TV results from replicated finalized classes and scored entries', async () => {
    replicationMocks.getClassesByTrial.mockResolvedValue([
      {
        id: 'class-done',
        trialId: 'trial-1',
        name: 'Advanced',
        element: 'Interior',
        level: 'Advanced',
        classStatus: 'completed',
        totalEntriesCount: 20,
        isScoringFinalized: true,
        judgeFirstName: 'Alice',
        judgeLastName: 'Smith',
      },
    ]);
    replicationMocks.getEntriesByShow.mockResolvedValue([
      {
        id: 'entry-1',
        showId: 'show-1',
        classId: 'class-done',
        dogId: 'dog-1',
        armband: '42',
        handler: 'J. Martinez',
        finalPlacement: '1',
        searchTimeSeconds: 35.1,
        totalPoints: null,
        total_score: 87.5,
        resultStatus: 'qualified',
      },
      {
        id: 'entry-2',
        showId: 'show-1',
        classId: 'class-done',
        dogId: 'dog-1',
        armband: '18',
        handler: 'S. Johnson',
        finalPlacement: '2',
        searchTimeSeconds: 38.2,
        resultStatus: 'qualified',
      },
      {
        id: 'entry-3',
        showId: 'show-1',
        classId: 'class-done',
        dogId: 'dog-1',
        finalPlacement: null,
        searchTimeSeconds: 40,
        resultStatus: 'qualified',
      },
    ]);

    const result = await getTVDisplayResults('show-1');

    expect(mockSupabase.from).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'class-done',
      name: 'Advanced',
      judgeName: 'Alice Smith',
      totalEntries: 20,
      qualifiedCount: 3,
      fastestTime: 35.1,
    });
    expect(result[0].placements.map(placement => placement.placement)).toEqual([1, 2]);
    expect(result[0].placements[0].totalScore).toBe(87.5);
    expect(result[0].placements[0].dog?.name).toBe('Luna Star');
  });
});
