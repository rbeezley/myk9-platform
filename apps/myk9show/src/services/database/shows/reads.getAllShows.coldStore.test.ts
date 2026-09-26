import { describe, expect, it, vi, beforeEach } from 'vitest';

const {
  mockShowsTable,
  mockClubsTable,
  mockTrialsTable,
  mockClassesTable,
  mockJudgeAssignmentsTable,
  mockPostgrestGetAllShows,
  mockHasAuthenticatedSession,
} = vi.hoisted(() => ({
  mockShowsTable: { getAllWithStatus: vi.fn() },
  mockClubsTable: { getAllWithStatus: vi.fn() },
  mockTrialsTable: { getAllWithStatus: vi.fn() },
  mockClassesTable: { getAllWithStatus: vi.fn() },
  mockJudgeAssignmentsTable: { getAllWithStatus: vi.fn() },
  mockPostgrestGetAllShows: vi.fn(),
  mockHasAuthenticatedSession: vi.fn(),
}));

vi.mock('../_shared/session', () => ({
  hasAuthenticatedSession: mockHasAuthenticatedSession,
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

/** A device read that succeeded with these rows. */
const ok = <T>(rows: T[]) => ({ ok: true as const, rows, error: null });

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
    mockClubsTable.getAllWithStatus.mockResolvedValue(ok([]));
    mockTrialsTable.getAllWithStatus.mockResolvedValue(ok([]));
    mockClassesTable.getAllWithStatus.mockResolvedValue(ok([]));
    mockJudgeAssignmentsTable.getAllWithStatus.mockResolvedValue(ok([]));
    mockHasAuthenticatedSession.mockResolvedValue(true);
  });

  it('asks the server when the local store holds no shows', async () => {
    mockShowsTable.getAllWithStatus.mockResolvedValue(ok([]));
    mockPostgrestGetAllShows.mockResolvedValue(REMOTE);

    const result = await getAllShows();

    expect(mockPostgrestGetAllShows).toHaveBeenCalledTimes(1);
    expect(result).toEqual(REMOTE);
  });

  it('keeps the empty local answer when the server cannot be reached (offline)', async () => {
    mockShowsTable.getAllWithStatus.mockResolvedValue(ok([]));
    mockPostgrestGetAllShows.mockRejectedValue(new Error('Failed to fetch'));

    const result = await getAllShows();

    expect(result).toEqual({ data: [], error: null });
  });

  it('trusts the empty local list for a guest, whose replica never syncs', async () => {
    // prefetchCriticalData runs this on every app load; a guest must not send
    // the whole catalog query each time.
    mockHasAuthenticatedSession.mockResolvedValue(false);
    mockShowsTable.getAllWithStatus.mockResolvedValue(ok([]));
    mockPostgrestGetAllShows.mockResolvedValue(REMOTE);

    const result = await getAllShows();

    expect(mockPostgrestGetAllShows).not.toHaveBeenCalled();
    expect(result).toEqual({ data: [], error: null });
  });

  it('does not ask the server when the local store has shows', async () => {
    mockShowsTable.getAllWithStatus.mockResolvedValue(
      ok([{ id: 'show-1', name: 'Heartland Classic', clubId: null }])
    );

    const result = await getAllShows();

    expect(mockPostgrestGetAllShows).not.toHaveBeenCalled();
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1);
  });
});

/**
 * MYK9-774: getAll() turns a failed device read into [], so the show list
 * reported "no judges" or "no classes" as fact. Every join read now fails the
 * local answer: online the server list stands in, offline the caller gets an
 * error instead of a show with an empty join.
 */
describe('getAllShows — a failed device read', () => {
  const LOCAL_SHOW = { id: 'show-1', name: 'Local Copy', startDate: '2026-10-10' };
  const REMOTE = { data: [{ id: 'show-1', name: 'Heartland Classic', trials: [] }], error: null };
  const failed = { ok: false as const, rows: [] as never[], error: new Error('IDB timeout') };
  const TABLES = {
    shows: mockShowsTable,
    clubs: mockClubsTable,
    trials: mockTrialsTable,
    classes: mockClassesTable,
    'judge assignments': mockJudgeAssignmentsTable,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockShowsTable.getAllWithStatus.mockResolvedValue(ok([LOCAL_SHOW]));
    mockClubsTable.getAllWithStatus.mockResolvedValue(ok([]));
    mockTrialsTable.getAllWithStatus.mockResolvedValue(ok([]));
    mockClassesTable.getAllWithStatus.mockResolvedValue(ok([]));
    mockJudgeAssignmentsTable.getAllWithStatus.mockResolvedValue(ok([]));
    mockHasAuthenticatedSession.mockResolvedValue(true);
  });

  it.each(Object.keys(TABLES))('uses the server list when %s cannot be read', async name => {
    TABLES[name as keyof typeof TABLES].getAllWithStatus.mockResolvedValue(failed);
    mockPostgrestGetAllShows.mockResolvedValue(REMOTE);

    const result = await getAllShows();

    expect(result).toEqual(REMOTE);
  });

  it.each(Object.keys(TABLES))('reports an error offline when %s cannot be read', async name => {
    TABLES[name as keyof typeof TABLES].getAllWithStatus.mockResolvedValue(failed);
    mockPostgrestGetAllShows.mockRejectedValue(new Error('Failed to fetch'));

    const result = await getAllShows();

    expect(result.error).not.toBeNull();
    expect(result.data).toEqual([]);
  });
});
