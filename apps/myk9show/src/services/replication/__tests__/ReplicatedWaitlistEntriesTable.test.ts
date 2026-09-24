/**
 * MYK9-660: the waitlist read path for a club admin.
 *
 * RLS decides WHICH rows the server returns; the client must (a) ask for them
 * with no role-dependent filter, so a club admin and a secretary who can see
 * the same rows read the same Waitlist sub-tab, and (b) actually fetch rows
 * that become visible after an RLS widening. (b) is the cache problem: an
 * incremental sync asks only for `updated_at > watermark`, and a row made
 * visible by the policy change keeps its old `updated_at`, so a replica that
 * synced before the fix would never see it without a coverage check.
 *
 * The Supabase mock below serves one fixed "visible to this caller" row set,
 * standing in for RLS, and honours the real query shape the table issues.
 */
import { createDatabaseError } from '@/services/database/databaseError';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

interface ServerRow {
  id: string;
  class_id: string;
  dog_id: string;
  exhibitor_id: string;
  handler_id: string | null;
  position: number;
  status: string;
  joined_via: string;
  offered_at: string | null;
  offer_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

const server = vi.hoisted(() => ({
  visibleRows: [] as ServerRow[],
  queries: [] as string[],
}));

vi.mock('@/services/database/supabaseClient', () => {
  const from = (table: string) => ({
    select: (columns: string, options?: { count?: string; head?: boolean }) => {
      if (options?.head) {
        server.queries.push(`${table}:count(${columns})`);
        return Promise.resolve({ count: server.visibleRows.length, error: null });
      }
      return {
        gt: (column: string, value: string) => ({
          order: () => {
            server.queries.push(`${table}:select(${columns}).gt(${column})`);
            const since = Date.parse(value);
            return Promise.resolve({
              data: server.visibleRows.filter(row => Date.parse(row.updated_at) > since),
              error: null,
            });
          },
        }),
      };
    },
  });
  return {
    supabase: { from },
    logQuery: vi.fn(),
    createDatabaseError,
  };
});

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: {
    getClassById: vi.fn(async (id: string) => ({
      id,
      name: 'Container Novice',
      trialId: 'trial-a',
    })),
  },
}));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: {
    getDogById: vi.fn(async (id: string) => ({ id, name: `Dog ${id}`, callName: `Dog ${id}` })),
  },
}));
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: { getTrialsByShow: vi.fn(async () => []) },
}));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: { getAll: vi.fn(async () => []) },
}));

import { replicatedWaitlistEntriesTable } from '../ReplicatedWaitlistEntriesTable';
import { getWaitlistByClass } from '@/services/database/waitlists/reads';

const CLASS_A = 'class-a';
const OLD = '2026-09-01T12:00:00.000Z';

function row(id: string, overrides: Partial<ServerRow> = {}): ServerRow {
  return {
    id,
    class_id: CLASS_A,
    dog_id: `dog-${id}`,
    exhibitor_id: `exhibitor-${id}`,
    handler_id: null,
    position: 1,
    status: 'waiting',
    joined_via: 'online',
    offered_at: null,
    offer_expires_at: null,
    created_at: OLD,
    updated_at: OLD,
    ...overrides,
  };
}

async function resetReplica() {
  const { databaseManager } = await import('@myk9/replication');
  await databaseManager.reset();
}

async function waitlistIdsForClass(): Promise<string[]> {
  const { data, error } = await getWaitlistByClass(CLASS_A);
  expect(error).toBeNull();
  return data.map(entry => entry.id).sort();
}

describe('ReplicatedWaitlistEntriesTable — MYK9-660 read path', () => {
  beforeEach(async () => {
    await resetReplica();
    server.visibleRows = [];
    server.queries = [];
  });

  afterEach(async () => {
    await resetReplica();
  });

  it('heals a replica cached before the RLS widening, whose rows predate the watermark', async () => {
    // Before the fix a club admin who is also an exhibitor saw only their own
    // waitlist row, and synced it a minute ago -- recently enough that the 24h
    // full-sync self-heal does not fire. The watermark is past every row below.
    const own = row('own', {
      position: 3,
      updated_at: new Date(Date.now() - 2 * 60_000).toISOString(),
    });
    server.visibleRows = [own];
    await replicatedWaitlistEntriesTable.sync();
    const cachedAt = Date.now() - 60_000;
    await replicatedWaitlistEntriesTable.updateSyncMetadata({
      lastIncrementalSyncAt: cachedAt,
      lastFullSyncAt: cachedAt,
    });
    expect(await waitlistIdsForClass()).toEqual(['own']);

    // After the migration RLS admits the show's whole waitlist. Those rows were
    // last written on OLD, before the watermark.
    server.visibleRows = [row('first', { position: 1 }), row('second', { position: 2 }), own];
    server.queries = [];
    const result = await replicatedWaitlistEntriesTable.sync();

    expect(result.success).toBe(true);
    expect(await waitlistIdsForClass()).toEqual(['first', 'own', 'second']);
    expect(server.queries).toContain('waitlist_entries:count(id)');
  });

  it('reads the same Waitlist sub-tab rows for a club admin as for a secretary', async () => {
    const showWaitlist = [row('first', { position: 1 }), row('second', { position: 2 })];

    // Secretary: RLS admits the show's waitlist.
    server.visibleRows = showWaitlist;
    await replicatedWaitlistEntriesTable.sync();
    const secretaryRows = await getWaitlistByClass(CLASS_A);
    const secretaryQueries = [...server.queries];

    // Club admin, on a fresh device: after MYK9-660 RLS admits the same rows.
    await resetReplica();
    server.queries = [];
    server.visibleRows = showWaitlist;
    await replicatedWaitlistEntriesTable.sync();
    const clubAdminRows = await getWaitlistByClass(CLASS_A);

    // No role-dependent client filter: the two callers issue the same queries,
    // so the rows they see are exactly the rows RLS admits.
    expect(server.queries).toEqual(secretaryQueries);
    expect(clubAdminRows).toEqual(secretaryRows);
    expect(clubAdminRows.data.map(entry => entry.id)).toEqual(['first', 'second']);
  });
});
