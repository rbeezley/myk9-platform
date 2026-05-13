import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockShowsTable, mockPostgrestGetSecretaryShows, mockPostgrestGetShowById } = vi.hoisted(
  () => ({
    mockShowsTable: {
      getAllShows: vi.fn(),
      getShowById: vi.fn(),
    },
    mockPostgrestGetSecretaryShows: vi.fn(),
    mockPostgrestGetShowById: vi.fn(),
  })
);

vi.mock('@/services/replication/ReplicatedShowsTable', () => ({
  replicatedShowsTable: mockShowsTable,
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
});
