/**
 * MYK9-2252: getAllClubs reads past PostgREST's 1,000-row cap, and returns the
 * list ordered by name.
 */
import { describe, expect, it, vi } from 'vitest';
import { createDatabaseError } from '@/services/database/databaseError';
import { createFakePostgrestTable } from '@/test/utils/fakePostgrestTable';

const server = vi.hoisted(() => ({
  table: null as unknown as { from: () => unknown; requests: string[] },
}));

vi.mock('../supabaseClient', () => ({
  supabase: { from: () => server.table.from() },
  logQuery: vi.fn(),
  createDatabaseError,
}));

import { getAllClubs } from './reads';

describe('getAllClubs paging', () => {
  it('returns every club when more than 1,000 exist, ordered by name', async () => {
    const rows = Array.from({ length: 2300 }, (_, i) => ({
      id: `club-${String(i).padStart(5, '0')}`,
      // Reverse alphabetical by id, so the order the server pages in is not name order.
      name: `Club ${String(2299 - i).padStart(5, '0')}`,
      deleted_at: null,
    }));
    server.table = createFakePostgrestTable(rows);

    const { data, error } = await getAllClubs();

    expect(error).toBeNull();
    expect(data).toHaveLength(2300);
    expect(new Set(data.map(club => club.id)).size).toBe(2300);
    expect(data[0]?.name).toBe('Club 00000');
    expect(data[2299]?.name).toBe('Club 02299');
    expect(server.table.requests).toHaveLength(3);
  });

  it('sorts case-insensitively, puts a null name last and breaks ties by id', async () => {
    server.table = createFakePostgrestTable([
      { id: 'c', name: null, deleted_at: null },
      { id: 'b', name: 'beta', deleted_at: null },
      { id: 'a2', name: 'Alpha', deleted_at: null },
      { id: 'a1', name: 'alpha', deleted_at: null },
      { id: 'd', name: 'Zulu', deleted_at: null },
    ]);

    const { data } = await getAllClubs();

    expect(data.map(club => club.id)).toEqual(['a1', 'a2', 'b', 'd', 'c']);
  });

  it('returns the error and no rows when a page fails', async () => {
    server.table = {
      requests: [],
      from: () => {
        const failing: Record<string, unknown> = {};
        for (const method of ['select', 'is', 'gt', 'order']) failing[method] = () => failing;
        failing.range = () => Promise.resolve({ data: null, error: { message: 'boom' } });
        return failing;
      },
    };

    const { data, error } = await getAllClubs();

    expect(data).toEqual([]);
    expect(error).not.toBeNull();
  });
});
