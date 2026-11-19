// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * MYK9-2168: the clubs identity boundary, against the real store, fence and
 * marker. Only the replica table, the session and the mutation queue are
 * stand-ins. Each case names a reader or writer the #4176 review found
 * leaking one account's restricted clubs to the next.
 */

type Row = { id: string; name: string; email: string; phone: string };
const rowA: Row = { id: 'club-a', name: 'Alpha Restricted', email: '', phone: '' };
const rowB: Row = { id: 'club-b', name: 'Bravo Club', email: '', phone: '' };

const h = vi.hoisted(() => ({
  session: { user: null as { id: string; is_anonymous?: boolean } | null, error: null as unknown },
  queue: [] as Array<{ tableName: string; authUserId?: string }>,
  failed: [] as Array<{ tableName: string; authUserId?: string }>,
  replica: [] as unknown[],
  subscriber: null as null | ((rows: unknown[]) => void),
  serverRows: {} as Record<string, unknown[]>,
  pull: null as null | (() => Promise<unknown>),
  table: {
    getAllClubs: vi.fn(),
    sync: vi.fn(),
    clearCache: vi.fn(),
    subscribe: vi.fn(),
    createClub: vi.fn(),
    updateClub: vi.fn(),
  },
}));

vi.mock('@/services/replication', () => ({ replicatedClubsTable: h.table }));
vi.mock('@/services/replication/ReplicatedClubsTable', () => ({
  replicatedClubsTable: h.table,
}));
vi.mock('@/services/LoggingService', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: h.session.user ? { user: h.session.user } : null },
        error: h.session.error,
      })),
    },
  },
}));
vi.mock('@myk9/replication', () => ({
  REPLICATION_STORES: { PENDING_MUTATIONS: 'pending', FAILED_MUTATIONS: 'failed' },
  databaseManager: {
    getDatabase: async () => ({
      transaction: () => ({
        objectStore: (name: string) => ({
          getAll: async () => (name === 'pending' ? h.queue : h.failed),
        }),
        done: Promise.resolve(),
      }),
    }),
  },
}));

import { applyClubsIdentity, resetClubReadinessForTests, useClubStore } from '../clubStore';
import {
  handleClubsAuthEvent,
  reconcileClubsIdentity,
  resetClubsIdentityBoundaryForTests,
  principalFromUser,
  whenClubsIdentitySettled,
  registerClubsIdentitySink,
} from '../clubsIdentityBoundary';
import { clubsPullsBlocked, resetClubsFenceForTests } from '@/services/replication/clubsSyncFence';
import { readReplicaPrincipal } from '@/services/replication/clubsReplicaPrincipal';
import { selectValidatedClubContext } from '@/hooks/useValidatedClubContext';
import { UserRole } from '@/types/auth-types';
import { markClubsFresh } from '../clubStore';

const userA = { id: 'user-a' };
const userB = { id: 'user-b' };

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: online });
}

/** The auth event the provider handler receives for a user. */
function signInAs(user: { id: string } | null) {
  h.session.user = user;
  if (user) handleClubsAuthEvent('SIGNED_IN', { user } as never);
  else handleClubsAuthEvent('SIGNED_OUT', null);
}

async function settle() {
  await whenClubsIdentitySettled();
}

describe('clubs identity boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    resetClubsFenceForTests();
    resetClubsIdentityBoundaryForTests();
    registerClubsIdentitySink({
      apply: applyClubsIdentity,
      getIdentity: () => useClubStore.getState().clubsIdentity,
      reload: () => useClubStore.getState().loadClubs(),
      markFresh: markClubsFresh,
    });
    h.session.user = null;
    h.session.error = null;
    h.queue = [];
    h.failed = [];
    h.replica = [];
    h.subscriber = null;
    h.pull = null;
    h.serverRows = { 'user-a': [rowA, rowB], 'user-b': [rowB], anon: [] };
    h.table.getAllClubs.mockImplementation(async () => [...h.replica]);
    h.table.clearCache.mockImplementation(async () => {
      h.replica = [];
    });
    h.table.sync.mockImplementation(async () => {
      if (h.pull) return h.pull();
      h.replica = [...(h.serverRows[h.session.user?.id ?? 'anon'] ?? [])];
      return { success: true };
    });
    h.table.subscribe.mockImplementation((cb: (rows: unknown[]) => void) => {
      h.subscriber = cb;
      cb([...h.replica]); // the first emission: whatever the replica holds now
      return () => undefined;
    });
    useClubStore.setState({ clubs: [], _unsubscribe: null, error: null });
    resetClubReadinessForTests();
    setOnline(true);
  });

  afterEach(() => {
    resetClubsFenceForTests();
    resetClubsIdentityBoundaryForTests();
  });

  it('withholds the store first subscription emission until the replica is verified', async () => {
    // A shared browser: account A left its restricted club in the replica.
    h.replica = [rowA];
    window.localStorage.setItem('myk9:clubs-replica-principal', 'user-a');

    useClubStore.getState().initializeSubscription();
    expect(useClubStore.getState().clubs).toEqual([]);

    // B signs in: still nothing shown, then B's own pull replaces the replica.
    signInAs(userB);
    expect(useClubStore.getState().clubs).toEqual([]);
    expect(useClubStore.getState().clubsIdentity.status).toBe('unverified');
    await settle();
    expect(useClubStore.getState().clubs.map(c => c.id)).toEqual(['club-b']);
    h.subscriber?.([rowA, rowB]);
    // Once verified, a later emission is published like any other.
    expect(useClubStore.getState().clubs.map(c => c.id)).toEqual(['club-a', 'club-b']);
  });

  it('empties the store in the same step as an account change, clears the replica, then full-syncs', async () => {
    signInAs(userA);
    await settle();
    expect(useClubStore.getState().clubs.map(c => c.id)).toEqual(['club-a', 'club-b']);
    expect(readReplicaPrincipal()).toEqual({ state: 'known', key: 'user-a' });

    h.table.clearCache.mockClear();
    signInAs(userB);
    // Synchronous: before any await, A's rows are gone from the store (Browse, My Club, picker).
    expect(useClubStore.getState().clubs).toEqual([]);
    expect(useClubStore.getState().clubsIdentity.status).toBe('unverified');
    expect(useClubStore.getState().clubReadiness).not.toBe('fresh');

    await settle();
    expect(h.table.clearCache).toHaveBeenCalledTimes(1);
    expect(useClubStore.getState().clubs.map(c => c.id)).toEqual(['club-b']);
    expect(readReplicaPrincipal()).toEqual({ state: 'known', key: 'user-b' });
  });

  it('sign-out empties the store and clears the replica', async () => {
    signInAs(userA);
    await settle();
    signInAs(null);
    expect(useClubStore.getState().clubs).toEqual([]);
    await settle();
    expect(h.replica).toEqual([]);
    expect(useClubStore.getState().clubReadiness).not.toBe('fresh');
  });

  it('does nothing for the same account again (a focus re-emit or a token refresh)', async () => {
    signInAs(userA);
    await settle();
    h.table.clearCache.mockClear();
    h.table.sync.mockClear();
    handleClubsAuthEvent('SIGNED_IN', { user: userA } as never);
    handleClubsAuthEvent('TOKEN_REFRESHED', { user: userA } as never);
    await settle();
    expect(h.table.clearCache).not.toHaveBeenCalled();
    expect(h.table.sync).not.toHaveBeenCalled();
    expect(useClubStore.getState().clubs).toHaveLength(2);
  });

  it('a reload by the account the replica belongs to shows its clubs offline, with no pull', async () => {
    h.replica = [rowA];
    window.localStorage.setItem('myk9:clubs-replica-principal', 'user-a');
    setOnline(false);
    signInAs(userA);
    await settle();
    expect(useClubStore.getState().clubs.map(c => c.id)).toEqual(['club-a']);
    expect(h.table.sync).not.toHaveBeenCalled();
  });

  it('a session whose user id differs from the replica marker is an account change', async () => {
    h.replica = [rowA];
    window.localStorage.setItem('myk9:clubs-replica-principal', 'user-a');
    // The first event after a reload: INITIAL_SESSION for B.
    h.session.user = userB;
    handleClubsAuthEvent('INITIAL_SESSION', { user: userB } as never);
    expect(useClubStore.getState().clubs).toEqual([]);
    await settle();
    expect(useClubStore.getState().clubs.map(c => c.id)).toEqual(['club-b']);
  });

  describe('a queued club edit from the previous account (a dirty row kept for its author)', () => {
    beforeEach(async () => {
      signInAs(userA);
      await settle();
      // A edited the restricted club offline; the edit waits in the queue.
      h.queue = [{ tableName: 'clubs', authUserId: 'user-a' }];
    });

    it('blocks the switch: nothing cleared, nothing pulled, nothing shown, with a reason', async () => {
      h.table.clearCache.mockClear();
      h.table.sync.mockClear();
      signInAs(userB);
      await settle();

      expect(h.table.clearCache).not.toHaveBeenCalled();
      expect(h.table.sync).not.toHaveBeenCalled();
      expect(h.replica.length).toBe(2); // A's rows, and the edit's row, are kept for A
      expect(useClubStore.getState().clubs).toEqual([]);
      expect(useClubStore.getState().clubsIdentity).toMatchObject({
        status: 'unverified',
        reason: 'pending-edits',
      });
      expect(useClubStore.getState().error).toMatch(/another account/i);
      expect(useClubStore.getState().clubReadiness).toBe('unavailable');
      expect(clubsPullsBlocked()).toBe(true);
    });

    it('counts an edit the server refused as unsent too', async () => {
      h.queue = [];
      h.failed = [{ tableName: 'clubs', authUserId: 'user-a' }];
      signInAs(userB);
      await settle();
      expect(useClubStore.getState().clubsIdentity.reason).toBe('pending-edits');
    });

    it('ignores another table queue rows', async () => {
      h.queue = [{ tableName: 'entries', authUserId: 'user-a' }];
      signInAs(userB);
      await settle();
      expect(useClubStore.getState().clubsIdentity.status).toBe('verified');
    });

    it('returns the clubs to their author when they sign back in, with no clear', async () => {
      signInAs(userB);
      await settle();
      h.table.clearCache.mockClear();
      signInAs(userA);
      await settle();
      expect(h.table.clearCache).not.toHaveBeenCalled();
      expect(useClubStore.getState().clubs.map(c => c.id)).toEqual(['club-a', 'club-b']);
      expect(clubsPullsBlocked()).toBe(false);
    });

    it('lets the new account in once the edit has been sent', async () => {
      signInAs(userB);
      await settle();
      expect(useClubStore.getState().clubs).toEqual([]);
      h.queue = [];
      await useClubStore.getState().ensureClubsReady();
      expect(useClubStore.getState().clubs.map(c => c.id)).toEqual(['club-b']);
    });

    it('never offers the picker or My Club the edited club', async () => {
      signInAs(userB);
      await settle();
      const { clubs, clubReadiness } = useClubStore.getState();
      expect(clubs).toEqual([]); // the host-club picker reads state.clubs
      expect(
        selectValidatedClubContext({
          roles: [UserRole.CLUB_ADMIN],
          scopes: [],
          clubs,
          readiness: clubReadiness,
          selectedClubId: '',
          selectedClubUserId: null,
          currentUserId: 'user-b',
        })
      ).toEqual({ status: 'unavailable' });
    });
  });

  describe('a pull whose session changes mid-pull', () => {
    it('discards the old account pull and never stamps its marker', async () => {
      signInAs(userA);
      let finishA!: () => void;
      h.pull = () =>
        new Promise(resolve => {
          finishA = () => {
            // A's pull lands after the account is already B's.
            h.replica = [rowA];
            resolve({ success: true });
          };
        });
      const a = reconcileClubsIdentity(principalFromUser(userA as never));
      await vi.waitFor(() => expect(h.table.sync).toHaveBeenCalledTimes(1));

      h.pull = null;
      signInAs(userB);
      finishA();
      await a;
      await settle();

      expect(readReplicaPrincipal()).toEqual({ state: 'known', key: 'user-b' });
      expect(useClubStore.getState().clubs.map(c => c.id)).toEqual(['club-b']);
      expect(useClubStore.getState().clubs.some(c => c.id === 'club-a')).toBe(false);
    });

    it('does not commit when the session is not the one the pull started under', async () => {
      h.session.user = userA;
      h.pull = async () => {
        h.pull = null;
        h.replica = [rowA];
        h.session.user = userB; // switched without an auth event reaching the boundary
        return { success: true };
      };
      await reconcileClubsIdentity(principalFromUser(userA as never));
      expect(readReplicaPrincipal().state).not.toBe('known');
      expect(useClubStore.getState().clubs.some(c => c.id === 'club-a')).toBe(false);
    });
  });

  describe('offline with no verified identity', () => {
    it('shows no clubs and says why when the session cannot be read', async () => {
      setOnline(false);
      h.session.user = null;
      h.session.error = new TypeError('Failed to fetch');
      await useClubStore.getState().ensureClubsReady();
      expect(useClubStore.getState().clubs).toEqual([]);
      expect(useClubStore.getState().clubsIdentity.reason).toBe('identity-unknown');
      expect(useClubStore.getState().error).toMatch(/which account/i);
    });

    it('shows none of the previous account clubs offline after a switch', async () => {
      signInAs(userA);
      await settle();
      setOnline(false);
      signInAs(userB);
      await settle();
      expect(useClubStore.getState().clubs).toEqual([]);
      expect(useClubStore.getState().clubsIdentity.reason).toBe('offline');
      expect(useClubStore.getState().error).toMatch(/internet/i);
    });

    it('settles the account when the connection returns', async () => {
      signInAs(userA);
      await settle();
      setOnline(false);
      signInAs(userB);
      await settle();
      setOnline(true);
      await useClubStore.getState().ensureClubsReady();
      expect(useClubStore.getState().clubs.map(c => c.id)).toEqual(['club-b']);
    });
  });

  describe('writers other than loadClubs', () => {
    beforeEach(() => {
      applyClubsIdentity({ status: 'unverified', reason: 'failed', principalKey: null });
      h.replica = [rowA];
    });

    it('loadClubs publishes nothing while unverified', async () => {
      await useClubStore.getState().loadClubs();
      expect(useClubStore.getState().clubs).toEqual([]);
    });

    it('a subscription emission publishes nothing while unverified', () => {
      useClubStore.getState().subscribeToChanges();
      expect(useClubStore.getState().clubs).toEqual([]);
      h.subscriber?.([rowA]);
      expect(useClubStore.getState().clubs).toEqual([]);
    });

    it('syncClubs does not pull into or read an unverified replica', async () => {
      h.session.user = userB;
      h.session.error = new TypeError('Failed to fetch');
      h.session.user = null;
      await useClubStore.getState().syncClubs();
      expect(h.table.sync).not.toHaveBeenCalled();
      expect(useClubStore.getState().clubs).toEqual([]);
    });

    it('addClub and updateClub refuse, and write nothing', async () => {
      const club = {
        id: 'club-a',
        name: 'x',
        email: '',
        phone: '',
        address: { street: '', city: '', state: '', zipCode: '', country: 'US' },
      } as never;
      expect(await useClubStore.getState().addClub(club)).toBeUndefined();
      await expect(useClubStore.getState().updateClub(club)).rejects.toThrow();
      expect(h.table.createClub).not.toHaveBeenCalled();
      expect(h.table.updateClub).not.toHaveBeenCalled();
    });

    it('a read that finishes after the account changed is discarded', async () => {
      signInAs(userA);
      await settle();
      let release!: () => void;
      h.table.getAllClubs.mockImplementationOnce(
        () =>
          new Promise(resolve => {
            release = () => resolve([rowA]);
          })
      );
      const read = useClubStore.getState().loadClubs();
      signInAs(userB);
      release();
      await read;
      expect(useClubStore.getState().clubs.some(c => c.id === 'club-a')).toBe(false);
    });
  });

  it('does not reuse the previous account freshness or in-flight refresh', async () => {
    signInAs(userA);
    await settle();
    expect((await useClubStore.getState().ensureClubsReady()).status).toBe('fresh');

    signInAs(userB);
    h.table.sync.mockClear();
    const result = await useClubStore.getState().ensureClubsReady();
    expect(result.clubs.map(c => c.id)).toEqual(['club-b']);
    expect(result.status).toBe('fresh');
    expect(h.table.sync).toHaveBeenCalled(); // B's own pull, not A's cached verdict
  });
});
