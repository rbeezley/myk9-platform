import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedClubsTable } from '../ReplicatedClubsTable';
import {
  advanceClubsFence,
  drainClubsFence,
  joinClubsFence,
  resetClubsFenceForTests,
  runBoundaryClubsPull,
  setClubsPullsBlocked,
} from '../clubsSyncFence';

/**
 * MYK9-2168: a pull of the clubs replica is bound to the account it started
 * under. A session that cannot be read is not a guest, an account change
 * aborts and discards the pull, and a blocked device pulls nothing.
 */

const h = vi.hoisted(() => ({
  getSession: vi.fn(),
  fetchStarted: null as null | (() => void),
  fetchGate: null as null | Promise<void>,
  from: vi.fn(),
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { auth: { getSession: h.getSession }, from: h.from },
}));
vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const session = (id: string) => ({ data: { session: { user: { id } } }, error: null });

describe('ReplicatedClubsTable account fence', () => {
  let table: ReplicatedClubsTable;

  beforeEach(async () => {
    vi.clearAllMocks();
    resetClubsFenceForTests();
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
    table = new ReplicatedClubsTable();
    h.fetchGate = null;
    h.fetchStarted = null;
    h.from.mockImplementation(() => ({
      select: () => ({
        is: () => ({
          gt: () => ({
            order: async () => {
              h.fetchStarted?.();
              await h.fetchGate;
              return { data: [], error: null };
            },
          }),
        }),
      }),
    }));
  });

  afterEach(async () => {
    resetClubsFenceForTests();
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  it('a session read that failed is not a signed-out visitor: no pull', async () => {
    h.getSession.mockResolvedValue({ data: { session: null }, error: new Error('offline') });
    const result = await table.sync();
    expect(result.success).toBe(false);
    expect(h.from).not.toHaveBeenCalled();
  });

  it('refuses to pull while another account has an unsent club change', async () => {
    h.getSession.mockResolvedValue(session('user-b'));
    setClubsPullsBlocked(true);
    const result = await table.sync();
    expect(result.success).toBe(false);
    expect(h.from).not.toHaveBeenCalled();
  });

  it('discards a pull whose account changed while it ran (fence advanced)', async () => {
    h.getSession.mockResolvedValue(session('user-a'));
    let release!: () => void;
    h.fetchGate = new Promise<void>(resolve => {
      release = resolve;
    });
    const started = new Promise<void>(resolve => {
      h.fetchStarted = resolve;
    });
    const pull = table.sync();
    await started;
    advanceClubsFence();
    release();
    const result = await pull;
    expect(result.success).toBe(false);
  });

  it('discards a pull whose session changed under it with no event (session re-read)', async () => {
    h.getSession.mockResolvedValueOnce(session('user-a')).mockResolvedValue(session('user-b'));
    const result = await table.sync();
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/account changed/i);
  });

  it('commits a pull whose account did not change', async () => {
    h.getSession.mockResolvedValue(session('user-a'));
    const result = await table.sync();
    expect(result.success).toBe(true);
  });

  describe('the fence', () => {
    it('aborts pulls in flight and lets the boundary wait for them to stop', async () => {
      const pull = joinClubsFence();
      expect(pull.isCurrent()).toBe(true);
      advanceClubsFence();
      expect(pull.signal.aborted).toBe(true);
      expect(pull.isCurrent()).toBe(false);

      let drained = false;
      const waiting = drainClubsFence().then(ok => {
        drained = ok;
      });
      await Promise.resolve();
      expect(drained).toBe(false);
      pull.release();
      await waiting;
      expect(drained).toBe(true);
    });

    it('gives up waiting on a pull that never stops', async () => {
      joinClubsFence();
      advanceClubsFence();
      expect(await drainClubsFence(20)).toBe(false);
    });

    it("carries the caller's own cancellation", () => {
      const own = new AbortController();
      const pull = joinClubsFence(own.signal);
      own.abort();
      expect(pull.signal.aborted).toBe(true);
      pull.release();
    });
  });

  describe('readers while the replica account is unverified (the block is on)', () => {
    beforeEach(async () => {
      await table.set('club-a', { id: 'club-a', name: 'Alpha', email: '', phone: '' });
    });

    it('every reader returns nothing, the show and show-day readers included', async () => {
      setClubsPullsBlocked(true);
      expect(await table.getAllClubs()).toEqual([]);
      expect(await table.getClubById('club-a')).toBeNull();
      expect(await table.getAllWithStatus()).toEqual({ ok: true, rows: [], error: null });
    });

    it('returns the rows again once the block is released', async () => {
      setClubsPullsBlocked(true);
      setClubsPullsBlocked(false);
      expect((await table.getAllClubs()).map(c => c.id)).toEqual(['club-a']);
      expect((await table.getClubById('club-a'))?.id).toBe('club-a');
    });

    it('the boundary pull still reads its own rows', async () => {
      setClubsPullsBlocked(true);
      await runBoundaryClubsPull(async () => {
        expect((await table.getAllClubs()).map(c => c.id)).toEqual(['club-a']);
      });
      expect(await table.getAllClubs()).toEqual([]);
    });
  });
});
