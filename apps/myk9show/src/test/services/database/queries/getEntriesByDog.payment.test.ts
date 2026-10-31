import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDatabaseError } from '@/services/database/databaseError';

// MYK9-1553: a stale local overlay must never contribute payment to a dog surface.

const { entries, dogs, classes, shows, serverRows, linkRows } = vi.hoisted(() => ({
  entries: { getAll: vi.fn() },
  dogs: { getAll: vi.fn() },
  classes: { getAll: vi.fn() },
  shows: { getAll: vi.fn() },
  serverRows: { current: [] as Record<string, unknown>[] },
  linkRows: { current: [] as Record<string, unknown>[] },
}));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    getAllOrThrow: entries.getAll,
    getCurrentAuthUserId: async () => 'user-test',
  },
}));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: { getAllDogs: dogs.getAll, getAll: dogs.getAll },
}));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: { getAllOrThrow: classes.getAll, getAll: classes.getAll },
}));
vi.mock('@/services/replication/ReplicatedShowsTable', () => ({
  replicatedShowsTable: { getAllShows: shows.getAll, getAll: shows.getAll },
}));

vi.mock('@/services/database/supabaseClient', () => {
  const chain = (rows: () => Record<string, unknown>[]) => {
    const builder: Record<string, unknown> = {};
    for (const method of ['eq', 'is', 'order', 'select']) builder[method] = () => builder;
    builder.then = (resolve: (value: unknown) => unknown) => resolve({ data: rows(), error: null });
    return builder;
  };
  return {
    supabase: {
      from: (table: string) => ({
        select: (columns: string) =>
          table === 'entries'
            ? chain(() =>
                columns.trim() === 'id,moved_from_entry_id' ? linkRows.current : serverRows.current
              )
            : chain(() => []),
      }),
    },
    logQuery: vi.fn(),
    createDatabaseError,
  };
});

import { getEntriesByDog } from '@/services/database/entries';

const serverRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'e1',
  dog_id: 'dog-1',
  entry_status: 'submitted',
  payment_status: 'paid_online',
  payment_method: 'online',
  entry_fee: 30,
  show: { id: 'show-1', name: 'Spring', start_date: '2099-05-01' },
  class: { id: 'class-1', name: 'Novice A' },
  ...overrides,
});

const localEntry = (overrides: Record<string, unknown> = {}) => ({
  id: 'e1',
  classId: 'class-1',
  showId: 'show-1',
  dogId: 'dog-1',
  entryStatus: 'submitted',
  paymentStatus: 'pending',
  paymentMethod: 'online',
  entryFee: 30,
  _syncStatus: 'pending',
  submittedAt: '2026-04-01T00:00:00Z',
  ...overrides,
});

describe('getEntriesByDog payment fields (MYK9-1553)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dogs.getAll.mockResolvedValue([{ id: 'dog-1', name: 'Max', ownerId: 'o1' }]);
    classes.getAll.mockResolvedValue([]);
    shows.getAll.mockResolvedValue([]);
    linkRows.current = [];
  });

  it('keeps the server payment when an unsynced local edit carries a stale pending', async () => {
    serverRows.current = [serverRow()];
    entries.getAll.mockResolvedValue([localEntry({ specialRequests: 'edited offline' })]);

    const { data, verified } = await getEntriesByDog('dog-1');
    const row = data[0] as Record<string, unknown>;

    expect(verified).toBe(true);
    expect(row.special_requests).toBe('edited offline');
    expect(row.payment_status).toBe('paid_online');
    expect(row.payment_method).toBe('online');
    expect(row.entry_fee).toBe(30);
  });

  it('withholds payment from a pending row the server has never seen', async () => {
    serverRows.current = [];
    entries.getAll.mockResolvedValue([localEntry()]);

    const { data } = await getEntriesByDog('dog-1');
    const row = data[0] as Record<string, unknown>;

    expect(row.payment_status).toBeNull();
    expect(row.entry_fee).toBeNull();
  });

  it('carries the move-up link onto the server row', async () => {
    serverRows.current = [serverRow({ id: 'e2' })];
    linkRows.current = [{ id: 'e2', moved_from_entry_id: 'e1' }];
    entries.getAll.mockResolvedValue([]);

    const { data } = await getEntriesByDog('dog-1');

    expect((data[0] as Record<string, unknown>).moved_from_entry_id).toBe('e1');
  });
});
