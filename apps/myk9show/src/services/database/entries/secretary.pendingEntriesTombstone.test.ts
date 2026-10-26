import { createDatabaseError } from '@/services/database/databaseError';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// MYK9-1408: the Secretary Dashboard "needs review" strip counts entries from
// `getPendingEntries`. `soft_delete_entry` only stamps `deleted_at` and leaves
// `entry_status` as it was, and the `entries_select` policy carries no
// tombstone predicate, so this read must filter `deleted_at` itself like every
// sibling read in reads.ts and secretaryPostgrest.ts. Without the filter a
// removed `submitted` entry keeps the dashboard saying "N entries need review"
// while Entry Management no longer lists it.
const mocks = vi.hoisted(() => ({
  logQuery: vi.fn(),
  supabaseFrom: vi.fn(),
}));

vi.mock('../supabaseClient', () => ({
  createDatabaseError,
  logQuery: mocks.logQuery,
  supabase: { from: mocks.supabaseFrom },
}));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {},
}));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: {},
}));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: {},
}));
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: {},
}));
vi.mock('@/services/replication/ReplicatedArmbandsTable', () => ({
  replicatedArmbandsTable: {},
}));
vi.mock('@/services/LoggingService', () => ({
  logger: { warn: vi.fn() },
}));

import { getPendingEntries } from './secretary';

const SUBMITTED_ROW = {
  id: 'entry-1',
  show_id: 'show-1',
  submitted_at: '2026-10-20T10:00:00.000Z',
  entry_status: 'submitted',
  check_in_status: null,
  dogs: { call_name: 'Scout' },
  people: { first_name: 'Harper', last_name: 'Handler' },
  classes: { name: 'Novice Containers' },
  shows: { name: 'Fall Trial' },
};

function mockPendingEntriesRead(data: unknown[]) {
  const query = {
    select: vi.fn(() => query),
    or: vi.fn(() => query),
    eq: vi.fn(() => query),
    is: vi.fn(() => query),
    order: vi.fn(() => Promise.resolve({ data, error: null })),
  };
  mocks.supabaseFrom.mockReturnValue(query);
  return query;
}

describe('getPendingEntries excludes soft-deleted entries (MYK9-1408)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('asks PostgREST for deleted_at IS NULL when reading every show', async () => {
    const query = mockPendingEntriesRead([SUBMITTED_ROW]);

    const result = await getPendingEntries();

    expect(mocks.supabaseFrom).toHaveBeenCalledWith('entries');
    expect(query.is).toHaveBeenCalledWith('deleted_at', null);
    expect(query.eq).not.toHaveBeenCalled();
    expect(result.map(entry => entry.id)).toEqual(['entry-1']);
  });

  it('keeps the tombstone filter alongside the show filter', async () => {
    const query = mockPendingEntriesRead([]);

    await getPendingEntries('show-1');

    expect(query.is).toHaveBeenCalledWith('deleted_at', null);
    expect(query.eq).toHaveBeenCalledWith('show_id', 'show-1');
  });
});
