import { describe, expect, it, vi, beforeEach } from 'vitest';

const {
  mockShowsTable,
  mockClubsTable,
  mockTrialsTable,
  mockClassesTable,
  mockJudgeAssignmentsTable,
  mockPostgrestGetAllShows,
} = vi.hoisted(() => ({
  mockShowsTable: { getAllShows: vi.fn() },
  mockClubsTable: { getAllClubs: vi.fn() },
  mockTrialsTable: { getAll: vi.fn() },
  mockClassesTable: { getAll: vi.fn() },
  mockJudgeAssignmentsTable: { getAll: vi.fn() },
  mockPostgrestGetAllShows: vi.fn(),
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
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: mockClassesTable,
}));
vi.mock('@/services/replication/ReplicatedJudgeAssignmentsTable', () => ({
  replicatedJudgeAssignmentsTable: mockJudgeAssignmentsTable,
}));
vi.mock('./reads.postgrest', async importOriginal => {
  const original = await importOriginal<typeof import('./reads.postgrest')>();
  return { ...original, postgrestGetAllShows: mockPostgrestGetAllShows };
});

import { getAllShows } from './reads';

/**
 * MYK9-764: on a fresh device the shows replica answers `[]` before its first
 * sync lands, and `withReplicationFallback` only falls back on a THROW, so the
 * empty array was reported as "this user has no shows". The show wizard's
 * "Clone from a previous show" card rendered, vanished on that false empty,
 * and came back a second later when the sync filled the store — shifting the
 * whole form by 182px under the secretary. An empty local list is now checked
 * against the server before it is believed.
 */
describe('getAllShows — cold replica', () => {
  const REMOTE = { data: [{ id: 'show-1', name: 'Heartland Classic', trials: [] }], error: null };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClubsTable.getAllClubs.mockResolvedValue([]);
    mockTrialsTable.getAll.mockResolvedValue([]);
    mockClassesTable.getAll.mockResolvedValue([]);
    mockJudgeAssignmentsTable.getAll.mockResolvedValue([]);
  });

  it('asks the server when the local store holds no shows', async () => {
    mockShowsTable.getAllShows.mockResolvedValue([]);
    mockPostgrestGetAllShows.mockResolvedValue(REMOTE);

    const result = await getAllShows();

    expect(mockPostgrestGetAllShows).toHaveBeenCalledTimes(1);
    expect(result).toEqual(REMOTE);
  });

  it('keeps the empty local answer when the server cannot be reached (offline)', async () => {
    mockShowsTable.getAllShows.mockResolvedValue([]);
    mockPostgrestGetAllShows.mockRejectedValue(new Error('Failed to fetch'));

    const result = await getAllShows();

    expect(result).toEqual({ data: [], error: null });
  });

  it('does not ask the server when the local store has shows', async () => {
    mockShowsTable.getAllShows.mockResolvedValue([
      { id: 'show-1', name: 'Heartland Classic', clubId: null },
    ]);

    const result = await getAllShows();

    expect(mockPostgrestGetAllShows).not.toHaveBeenCalled();
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1);
  });
});
