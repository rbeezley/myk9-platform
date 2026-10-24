import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchJudgeAssignments } from '../useJudgeAssignments';
import type { ReplicatedJudgeAssignment } from '@/services/replication';

const mockAssignmentsGetAll = vi.fn();
const mockShowById = vi.fn();
const mockTrialById = vi.fn();

vi.mock('@/services/replication', () => ({
  replicatedJudgeAssignmentsTable: {
    getAllOrThrow: () => mockAssignmentsGetAll(),
  },
  replicatedClassesTable: { getAllOrThrow: async () => [] },
  replicatedEntriesTable: {
    sync: async () => ({ success: true }),
    getEntriesByShow: async () => [],
    getSyncMetadata: async () => ({ totalRows: 0, syncedByAuthUserId: 'user-test' }),
    getCurrentAuthUserId: async () => 'user-test',
  },
  replicatedShowsTable: { getShowById: (id: string) => mockShowById(id) },
  replicatedTrialsTable: { getTrialById: (id: string) => mockTrialById(id) },
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: vi.fn() },
  logQuery: vi.fn(),
  createDatabaseError: vi.fn(),
}));

const makeReplicated = (
  overrides: Partial<ReplicatedJudgeAssignment> = {}
): ReplicatedJudgeAssignment => ({
  id: 'assignment-1',
  personId: 'person-123',
  showId: 'show-1',
  trialId: 'trial-1',
  classId: 'class-1',
  status: 'confirmed',
  invitedAt: null,
  confirmedAt: null,
  fee: null,
  notes: null,
  className: 'Container Novice A',
  classElement: 'Container',
  classLevel: 'Novice',
  classStatus: 'upcoming',
  classStartTime: '09:00:00',
  classCheckedInCount: 0,
  classScoredCount: 0,
  classTotalEntries: 0,
  trialDate: '2026-10-23',
  trialTimezone: 'America/Chicago',
  ...overrides,
});

describe('fetchJudgeAssignments show and trial labels (MYK9-1342)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('populates showName and trialLabel from the replicated shows and trials', async () => {
    mockAssignmentsGetAll.mockResolvedValue([
      makeReplicated({ id: 'a1', showId: 'show-1', trialId: 'trial-1' }),
      makeReplicated({ id: 'a2', showId: 'show-2', trialId: 'trial-3' }),
    ]);
    mockShowById.mockImplementation(async (id: string) =>
      id === 'show-1' ? { id, name: 'Fall Classic' } : { id, name: 'Harvest Nosework' }
    );
    mockTrialById.mockImplementation(async (id: string) =>
      id === 'trial-1' ? { id, name: 'Trial 2', trialNumber: '2' } : { id, trialNumber: '1' }
    );

    const result = await fetchJudgeAssignments('person-123');

    expect(result.find(a => a.id === 'a1')).toMatchObject({
      showName: 'Fall Classic',
      trialLabel: 'Trial 2',
    });
    expect(result.find(a => a.id === 'a2')).toMatchObject({
      showName: 'Harvest Nosework',
      trialLabel: '1',
    });
  });

  it('keeps the assignment, without labels, when the shows and trials replicas throw', async () => {
    mockAssignmentsGetAll.mockResolvedValue([makeReplicated()]);
    mockShowById.mockRejectedValue(new Error('shows store unavailable'));
    mockTrialById.mockRejectedValue(new Error('trials store unavailable'));

    const result = await fetchJudgeAssignments('person-123');

    expect(result).toHaveLength(1);
    expect(result[0].showName).toBeUndefined();
    expect(result[0].trialLabel).toBeUndefined();
  });
});
