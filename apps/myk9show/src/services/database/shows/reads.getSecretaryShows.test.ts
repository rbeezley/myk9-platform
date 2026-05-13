import { describe, expect, it, vi, beforeEach } from 'vitest';

const {
  mockShowsTable,
  mockClubsTable,
  mockTrialsTable,
  mockJudgeAssignmentsTable,
  mockPostgrestGetSecretaryShows,
  mockPostgrestGetShowById,
} = vi.hoisted(() => ({
  mockShowsTable: {
    getAllShows: vi.fn(),
    getShowById: vi.fn(),
  },
  mockClubsTable: {
    getClubById: vi.fn(),
  },
  mockTrialsTable: {
    getTrialsByShow: vi.fn(),
  },
  mockJudgeAssignmentsTable: {
    getByShowId: vi.fn(),
  },
  mockPostgrestGetSecretaryShows: vi.fn(),
  mockPostgrestGetShowById: vi.fn(),
}));

vi.mock('@/services/replication/ReplicatedShowsTable', () => ({
  replicatedShowsTable: mockShowsTable,
}));

vi.mock('@/services/replication/ReplicatedClubsTable', () => ({
  replicatedClubsTable: mockClubsTable,
}));

vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: mockTrialsTable,
}));

vi.mock('@/services/replication/ReplicatedJudgeAssignmentsTable', () => ({
  replicatedJudgeAssignmentsTable: mockJudgeAssignmentsTable,
}));

vi.mock('./reads.postgrest', async importOriginal => {
  const original = await importOriginal<typeof import('./reads.postgrest')>();
  return {
    ...original,
    postgrestGetSecretaryShows: mockPostgrestGetSecretaryShows,
    postgrestGetShowById: mockPostgrestGetShowById,
  };
});

import { getSecretaryShows, getShowById } from './reads';

describe('getSecretaryShows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClubsTable.getClubById.mockResolvedValue(null);
    mockTrialsTable.getTrialsByShow.mockResolvedValue([]);
    mockJudgeAssignmentsTable.getByShowId.mockResolvedValue([]);
  });

  it('falls back to PostgREST when the replicated show cache is empty', async () => {
    mockShowsTable.getAllShows.mockResolvedValue([]);
    mockPostgrestGetSecretaryShows.mockResolvedValue({
      data: [
        {
          id: 'show-from-server',
          name: 'Server Show',
          start_date: '2026-06-01',
          end_date: '2026-06-02',
        },
      ],
      error: null,
    });

    const result = await getSecretaryShows('secretary-user');

    expect(mockPostgrestGetSecretaryShows).toHaveBeenCalledOnce();
    expect(result.data).toEqual([
      {
        id: 'show-from-server',
        name: 'Server Show',
        start_date: '2026-06-01',
        end_date: '2026-06-02',
      },
    ]);
    expect(result.error).toBeNull();
  });

  it('falls back to PostgREST when a requested show is missing from the cache', async () => {
    mockShowsTable.getShowById.mockResolvedValue(null);
    mockPostgrestGetShowById.mockResolvedValue({
      data: {
        id: 'show-from-server',
        name: 'Server Show',
        start_date: '2026-06-01',
        end_date: '2026-06-02',
      },
      error: null,
    });

    const result = await getShowById('show-from-server');

    expect(mockPostgrestGetShowById).toHaveBeenCalledWith('show-from-server');
    expect(result.data).toMatchObject({ id: 'show-from-server' });
    expect(result.error).toBeNull();
  });

  it('merges remote judge assignments into cached show details', async () => {
    mockShowsTable.getShowById.mockResolvedValue({
      id: 'show-1',
      name: 'Cached Show',
      organization: 'AKC',
      startDate: '2026-06-01',
      endDate: '2026-06-02',
      location: 'Olathe, KS',
      status: 'upcoming',
    });
    mockPostgrestGetShowById.mockResolvedValue({
      data: {
        id: 'show-1',
        judge_assignments: [
          {
            id: 'assignment-1',
            person_id: 'person-1',
            show_id: 'show-1',
            class_id: null,
            people: { first_name: 'Liz', last_name: 'Beezley' },
          },
        ],
      },
      error: null,
    });

    const result = await getShowById('show-1');

    expect(result.data).toMatchObject({
      id: 'show-1',
      name: 'Cached Show',
      judge_assignments: [
        {
          id: 'assignment-1',
          person_id: 'person-1',
          show_id: 'show-1',
          class_id: null,
          people: { first_name: 'Liz', last_name: 'Beezley' },
        },
      ],
    });
  });
});
