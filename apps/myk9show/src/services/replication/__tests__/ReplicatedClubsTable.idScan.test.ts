/**
 * The clubs visibility reconcile (a HEAD count then an id read) follows the
 * id-scan cadence (MYK9-1302): it runs on the first pass, is skipped on an
 * intermediate pass, runs again after an engine full sync or when the hour is
 * up, and an incomplete read (count error, oversize count, id read error)
 * leaves the debt owed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedClubsTable } from '../ReplicatedClubsTable';
import { ID_SCAN_INTERVAL_MS, resetIdScanCadence } from '../idScanCadence';
import { supabase } from '@/services/database/supabaseClient';

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: 'secretary-1' } } },
      }),
    },
  },
}));

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

interface Server {
  /** Clubs answered to the delta and the id read. */
  liveIds: string[];
  /** The HEAD count; an Error answers as a PostgREST error. */
  count?: number | Error;
  /** Fail the id read. */
  failIdRead?: boolean;
}

/** Route `supabase.from('clubs')` to an in-memory server; returns a counter of id reads. */
function installServer(server: Server): { idReads: () => number; counts: () => number } {
  let idReads = 0;
  let counts = 0;
  const row = (id: string) => ({
    id,
    name: `Club ${id}`,
    club_type: 'kennel_club',
    status: 'active',
    deleted_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  });
  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    if (table !== 'clubs') throw new Error(`unexpected table ${table}`);
    const chain = (cols: string): Record<string, unknown> => {
      const self: Record<string, unknown> = {};
      self.is = () => self;
      self.gt = () => self;
      self.order = async () => ({ data: server.liveIds.map(row), error: null });
      self.limit = async () => {
        idReads += 1;
        return server.failIdRead
          ? { data: null, error: { message: 'id read failed' } }
          : { data: server.liveIds.map(id => ({ id })), error: null };
      };
      void cols;
      return self;
    };
    return {
      select: (cols: string, opts?: { head?: boolean }) => {
        if (opts?.head) {
          counts += 1;
          const answer =
            server.count instanceof Error
              ? { count: null, error: { message: server.count.message } }
              : { count: server.count ?? server.liveIds.length, error: null };
          const headChain: Record<string, unknown> = {
            is: () => headChain,
            then: (resolve: (v: unknown) => unknown) => resolve(answer),
          };
          return headChain;
        }
        return chain(cols);
      },
    };
  }) as unknown as typeof supabase.from);
  return { idReads: () => idReads, counts: () => counts };
}

describe('ReplicatedClubsTable visibility reconcile cadence (MYK9-1302)', () => {
  let table: ReplicatedClubsTable;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-10T12:00:00Z'));
    resetIdScanCadence();
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
    table = new ReplicatedClubsTable();
  });

  afterEach(async () => {
    vi.useRealTimers();
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  it('reconciles on the first pass, skips an intermediate pass, and reconciles again when the hour is up', async () => {
    const first = installServer({ liveIds: ['c1'] });
    expect((await table.sync()).success).toBe(true);
    expect(first.counts()).toBe(1);
    expect(first.idReads()).toBe(1);

    const quiet = installServer({ liveIds: ['c1'] });
    vi.setSystemTime(Date.now() + 60_000);
    const second = await table.sync();
    expect(second.operation).toBe('incremental-sync');
    expect(quiet.counts()).toBe(0);
    expect(quiet.idReads()).toBe(0);

    const later = installServer({ liveIds: ['c1'] });
    vi.setSystemTime(Date.now() + ID_SCAN_INTERVAL_MS);
    await table.sync();
    expect(later.idReads()).toBe(1);
  });

  it.each([
    ['a count error', { liveIds: ['c1'], count: new Error('count failed') }],
    ['a count above the page size', { liveIds: ['c1'], count: 1001 }],
    ['a failed id read', { liveIds: ['c1'], failIdRead: true }],
  ] satisfies [string, Server][])('leaves the reconcile owed after %s', async (_label, server) => {
    installServer(server);
    await table.sync();

    const next = installServer({ liveIds: ['c1'] });
    vi.setSystemTime(Date.now() + 60_000);
    await table.sync();
    expect(next.counts()).toBe(1);
    expect(next.idReads()).toBe(1);
  });

  it('reconciles despite a fresh stamp when the engine pass was a full sync', async () => {
    installServer({ liveIds: ['c1'] });
    await table.sync();

    // A principal change makes the clubs table force a full resync (MYK9-572).
    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: { session: { user: { id: 'secretary-2' } } },
    } as never);
    const forced = installServer({ liveIds: ['c1'] });
    vi.setSystemTime(Date.now() + 60_000);
    const result = await table.sync();
    expect(result.operation).toBe('full-sync');
    expect(forced.idReads()).toBe(1);
  });
});
