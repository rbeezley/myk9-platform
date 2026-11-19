import { describe, expect, it, vi, beforeEach } from 'vitest';

const {
  mockShowsTable,
  mockClubsTable,
  mockTrialsTable,
  mockClassesTable,
  mockJudgeAssignmentsTable,
  mockPostgrestGetShowById,
} = vi.hoisted(() => ({
  mockShowsTable: { getShowById: vi.fn(), getAllShows: vi.fn() },
  mockClubsTable: { getClubById: vi.fn() },
  mockTrialsTable: { getAllWithStatus: vi.fn() },
  mockClassesTable: { getAllWithStatus: vi.fn() },
  mockJudgeAssignmentsTable: { getAllWithStatus: vi.fn() },
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
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: mockClassesTable,
}));
vi.mock('@/services/replication/ReplicatedJudgeAssignmentsTable', () => ({
  replicatedJudgeAssignmentsTable: mockJudgeAssignmentsTable,
}));
vi.mock('./reads.postgrest', async importOriginal => {
  const original = await importOriginal<typeof import('./reads.postgrest')>();
  return { ...original, postgrestGetShowById: mockPostgrestGetShowById };
});

import { getShowById } from './reads';

/** A device read that succeeded with these rows. */
const ok = <T>(rows: T[]) => ({ ok: true as const, rows, error: null });

/**
 * MYK9-2041: the replicated show row has no premium-publish columns (they are RPC-owned), so
 * a signed-in visitor's public page could never offer the published premium. getShowById
 * already reads the remote row; it carries those columns over.
 */
describe('getShowById: premium-publish columns from the server row', () => {
  const PUBLISH = {
    published_premium_path: 'show-1/0b8d3c1e-2f4a-4b5c-8d6e-7f8a9b0c1d2e.pdf',
    published_premium_url: null,
    published_premium_at: '2026-07-01T12:00:00Z',
    published_premium_version: 3,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockShowsTable.getShowById.mockResolvedValue({ id: 'show-1', name: 'Show', clubId: null });
    mockClubsTable.getClubById.mockResolvedValue(null);
    mockTrialsTable.getAllWithStatus.mockResolvedValue(ok([]));
    mockClassesTable.getAllWithStatus.mockResolvedValue(ok([]));
    mockJudgeAssignmentsTable.getAllWithStatus.mockResolvedValue(ok([]));
  });

  it('copies the publish columns from the remote row onto the replicated detail row', async () => {
    mockPostgrestGetShowById.mockResolvedValue({
      data: { id: 'show-1', trials: [], judge_assignments: [], ...PUBLISH },
      error: null,
    });

    const result = await getShowById('show-1');

    expect(result.data).toMatchObject(PUBLISH);
  });

  it('takes the announcement fields from the server, so an unpublished show reads as unpublished', async () => {
    mockShowsTable.getShowById.mockResolvedValue({
      id: 'show-1',
      name: 'Show',
      clubId: null,
      experienceIsPublished: true,
      experiencePublishedContent: { stale: true },
    });
    const UNPUBLISHED = {
      experience_is_published: false,
      experience_published_at: null,
      experience_published_style: null,
      experience_published_content: null,
    };
    mockPostgrestGetShowById.mockResolvedValue({
      data: { id: 'show-1', trials: [], judge_assignments: [], ...UNPUBLISHED },
      error: null,
    });

    const result = await getShowById('show-1');

    expect(result.data).toMatchObject(UNPUBLISHED);
  });

  it('keeps the replicated row when the remote read fails', async () => {
    mockPostgrestGetShowById.mockRejectedValue(new Error('offline'));

    const result = await getShowById('show-1');

    expect(result.error).toBeNull();
    expect((result.data as Record<string, unknown>).id).toBe('show-1');
    expect(result.data).not.toHaveProperty('published_premium_at', PUBLISH.published_premium_at);
  });
});
