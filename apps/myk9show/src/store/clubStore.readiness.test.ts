import { beforeEach, describe, expect, it, vi } from 'vitest';

const replication = vi.hoisted(() => ({
  reconcilePrincipal: vi.fn(),
  getAllClubs: vi.fn(),
  sync: vi.fn(),
  subscribe: vi.fn(),
  createClub: vi.fn(),
  updateClub: vi.fn(),
  deleteClubLocal: vi.fn(),
}));
const logging = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/services/replication', () => ({ replicatedClubsTable: replication }));
vi.mock('@/services/LoggingService', () => ({ logger: logging }));

import { resetClubReadinessForTests, useClubStore, type ClubReadinessResult } from './clubStore';

const clubRow = {
  id: 'club-a',
  name: 'Alpha Club',
  email: 'alpha@example.com',
  phone: '',
  website: undefined,
  description: undefined,
  logoUrl: undefined,
  address: '1 Main St, Town, ST 00000, US',
  city: 'Town',
  state: 'ST',
  zipCode: '00000',
};

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value: online,
  });
}

describe('clubStore.ensureClubsReady', () => {
  let localRows: (typeof clubRow)[];

  beforeEach(() => {
    vi.clearAllMocks();
    localRows = [];
    replication.reconcilePrincipal.mockResolvedValue('user-a');
    replication.getAllClubs.mockImplementation(async () => localRows);
    replication.sync.mockResolvedValue({ success: true });
    useClubStore.setState({
      clubs: [],
      clubsPrincipalMarker: null,
      isLoading: false,
      isSyncing: false,
      error: null,
      clubReadiness: 'loading',
    });
    resetClubReadinessForTests();
    setOnline(true);
  });

  it('refreshes an empty cache and returns the reloaded clubs', async () => {
    replication.sync.mockImplementation(async () => {
      localRows = [clubRow];
      return { success: true };
    });

    const result = await useClubStore.getState().ensureClubsReady();

    expect(result.status).toBe('fresh');
    expect(result.clubs.map(club => club.id)).toEqual(['club-a']);
    expect(replication.sync).toHaveBeenCalledTimes(1);
  });

  it('refreshes a populated cache once before marking the session fresh', async () => {
    localRows = [clubRow];

    const first = await useClubStore.getState().ensureClubsReady();
    const second = await useClubStore.getState().ensureClubsReady();

    expect(first.status).toBe('fresh');
    expect(second.status).toBe('fresh');
    expect(replication.sync).toHaveBeenCalledTimes(1);
  });

  it('accepts a successful zero-club response as an empty directory', async () => {
    const result = await useClubStore.getState().ensureClubsReady();

    expect(result).toEqual({ status: 'fresh', clubs: [] });
    expect(replication.sync).toHaveBeenCalledTimes(1);
  });

  it('refreshes when a requested club is absent from a previously fresh cache', async () => {
    localRows = [clubRow];
    await useClubStore.getState().ensureClubsReady();

    const result = await useClubStore
      .getState()
      .ensureClubsReady({ requestedClubId: 'club-not-in-cache' });

    expect(result.status).toBe('fresh');
    expect(replication.sync).toHaveBeenCalledTimes(2);
  });

  it('deduplicates concurrent remote refreshes', async () => {
    let resolveSync: (value: { success: boolean }) => void = () => undefined;
    replication.sync.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveSync = value => {
            localRows = [clubRow];
            resolve(value);
          };
        })
    );

    const first = useClubStore.getState().ensureClubsReady();
    const second = useClubStore.getState().ensureClubsReady({ requestedClubId: 'missing' });

    await vi.waitFor(() => expect(replication.sync).toHaveBeenCalledTimes(1));
    expect(replication.sync).toHaveBeenCalledTimes(1);
    resolveSync({ success: true });

    const results = await Promise.all([first, second]);
    expect(results.every(result => result.status === 'fresh')).toBe(true);
    expect(replication.sync).toHaveBeenCalledTimes(1);
  });

  it('keeps cached clubs available offline without attempting remote sync', async () => {
    localRows = [clubRow];
    setOnline(false);

    const result = await useClubStore.getState().ensureClubsReady();

    expect(result.status).toBe('offline');
    expect(result.clubs).toHaveLength(1);
    expect(replication.sync).not.toHaveBeenCalled();
  });

  it('returns an unavailable state for an empty cache when refresh fails', async () => {
    replication.sync.mockResolvedValue({ success: false });

    const result: ClubReadinessResult = await useClubStore.getState().ensureClubsReady();

    expect(result).toEqual({ status: 'unavailable', clubs: [] });
    expect(useClubStore.getState().clubs).toEqual([]);
    expect(logging.warn).toHaveBeenCalledTimes(1);
    expect(logging.warn).toHaveBeenCalledWith('Club data refresh failed', 'clubs');
  });

  it('preserves cached clubs and reports one sanitized event when sync rejects', async () => {
    localRows = [clubRow];
    replication.sync.mockRejectedValue(new Error('secret transport details'));

    const result = await useClubStore.getState().ensureClubsReady();

    expect(result.status).toBe('unavailable');
    expect(result.clubs).toHaveLength(1);
    expect(logging.warn).toHaveBeenCalledTimes(1);
    expect(logging.warn).not.toHaveBeenCalledWith(
      expect.stringContaining('secret transport details'),
      expect.anything()
    );
  });

  it('times out caller-visible waiting while keeping the sync deduplicated until it settles', async () => {
    vi.useFakeTimers();
    let resolveSync: (value: { success: boolean }) => void = () => undefined;
    replication.sync.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveSync = resolve;
        })
    );

    const first = useClubStore.getState().ensureClubsReady();
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(first).resolves.toEqual({ status: 'unavailable', clubs: [] });
    expect(replication.sync).toHaveBeenCalledTimes(1);

    localRows = [clubRow];
    vi.useRealTimers();
    resolveSync({ success: true });
    await new Promise(resolve => setTimeout(resolve, 0));
    replication.sync.mockResolvedValue({ success: true });

    const retry = await useClubStore.getState().ensureClubsReady({ force: true });
    expect(retry.status).toBe('fresh');
    expect(replication.sync).toHaveBeenCalledTimes(2);
  });

  // QA-CLUB-PAYMENTS-041. Consumers conditionally MOUNT on this readiness
  // (useValidatedClubContext -> ClubPaymentsPage), so a revalidation that dips
  // back to 'loading' unmounts their subtree and destroys local state. It
  // presented as the payment-setup buttons "doing nothing": the checklist opened
  // and was immediately discarded by a remount.
  describe('does not flap readiness back to loading once data is on screen', () => {
    async function settleReady() {
      localRows = [clubRow];
      const first = await useClubStore.getState().ensureClubsReady();
      expect(first.status).toBe('fresh');
      expect(useClubStore.getState().clubReadiness).toBe('fresh');
    }

    it('keeps readiness at fresh across a repeat call', async () => {
      await settleReady();

      const seen: string[] = [];
      const unsubscribe = useClubStore.subscribe(state => seen.push(state.clubReadiness));

      await useClubStore.getState().ensureClubsReady();
      unsubscribe();

      expect(seen).not.toContain('loading');
      expect(useClubStore.getState().clubReadiness).toBe('fresh');
    });

    it('keeps readiness at fresh across a forced refresh', async () => {
      await settleReady();

      const seen: string[] = [];
      const unsubscribe = useClubStore.subscribe(state => seen.push(state.clubReadiness));

      await useClubStore.getState().ensureClubsReady({ force: true });
      unsubscribe();

      // force re-syncs, but the treasurer's card must stay mounted while it does.
      expect(seen).not.toContain('loading');
      expect(replication.sync).toHaveBeenCalled();
    });

    it('still announces loading on the initial load, when there is nothing to show', async () => {
      const seen: string[] = [];
      const unsubscribe = useClubStore.subscribe(state => seen.push(state.clubReadiness));

      localRows = [clubRow];
      await useClubStore.getState().ensureClubsReady();
      unsubscribe();

      expect(seen).toContain('loading');
    });

    it('still announces loading when retrying from an unavailable state', async () => {
      // No usable data: the operator asked for a retry and should see progress.
      useClubStore.setState({ clubs: [], clubReadiness: 'unavailable' });

      const seen: string[] = [];
      const unsubscribe = useClubStore.subscribe(state => seen.push(state.clubReadiness));

      localRows = [clubRow];
      await useClubStore.getState().ensureClubsReady({ force: true });
      unsubscribe();

      expect(seen).toContain('loading');
    });
  });
  describe('every path settles (MYK9-2104)', () => {
    it('settles as unavailable when sync throws before returning a promise', async () => {
      replication.sync.mockImplementation(() => {
        throw new Error('boom');
      });

      const result = await useClubStore.getState().ensureClubsReady();

      expect(result.status).toBe('unavailable');
      expect(useClubStore.getState().clubReadiness).toBe('unavailable');
    });

    it('settles as unavailable when sync rejects', async () => {
      replication.sync.mockRejectedValue(new Error('network'));

      await useClubStore.getState().ensureClubsReady();

      expect(useClubStore.getState().clubReadiness).toBe('unavailable');
    });

    it('settles as unavailable when the local club read never returns', async () => {
      vi.useFakeTimers();
      try {
        replication.getAllClubs.mockImplementation(() => new Promise(() => undefined));

        const pending = useClubStore.getState().ensureClubsReady();
        expect(useClubStore.getState().clubReadiness).toBe('loading');
        await vi.advanceTimersByTimeAsync(16_000);
        const result = await pending;

        expect(result.status).toBe('unavailable');
        expect(useClubStore.getState().clubReadiness).toBe('unavailable');
        expect(replication.sync).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('settles as unavailable when sync never returns, and a retry can recover', async () => {
      vi.useFakeTimers();
      try {
        replication.sync.mockImplementation(() => new Promise(() => undefined));

        const pending = useClubStore.getState().ensureClubsReady();
        await vi.advanceTimersByTimeAsync(16_000);
        await pending;
        expect(useClubStore.getState().clubReadiness).toBe('unavailable');
      } finally {
        vi.useRealTimers();
      }
    });
  });
});

// MYK9-2168: rows another account left in the shared replica are dropped
// BEFORE the store reads, and the store records whose view it now holds.
describe('clubStore.loadClubs principal reconcile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    replication.getAllClubs.mockResolvedValue([clubRow]);
    useClubStore.setState({ clubs: [], clubsPrincipalMarker: null, error: null });
  });

  it('reconciles the principal before reading and stores the verified marker', async () => {
    const order: string[] = [];
    replication.reconcilePrincipal.mockImplementation(async () => {
      order.push('reconcile');
      return 'user-b';
    });
    replication.getAllClubs.mockImplementation(async () => {
      order.push('read');
      return [clubRow];
    });

    await useClubStore.getState().loadClubs();

    expect(order).toEqual(['reconcile', 'read']);
    expect(useClubStore.getState().clubsPrincipalMarker).toBe('user-b');
    expect(useClubStore.getState().clubs.map(club => club.id)).toEqual(['club-a']);
  });

  it('leaves the marker unverified when the session could not be read', async () => {
    replication.reconcilePrincipal.mockResolvedValue(null);

    await useClubStore.getState().loadClubs();

    expect(useClubStore.getState().clubsPrincipalMarker).toBeNull();
  });

  it('publishes nothing when identity could not be settled', async () => {
    replication.reconcilePrincipal.mockResolvedValue(null);

    await useClubStore.getState().loadClubs();

    expect(replication.getAllClubs).not.toHaveBeenCalled();
    expect(useClubStore.getState().clubs).toEqual([]);
  });

  it('withholds a subscription snapshot (incl. the initial emission) until a principal is verified', () => {
    let emit: (rows: (typeof clubRow)[]) => void = () => {};
    replication.subscribe.mockImplementation(cb => {
      emit = cb;
      return () => {};
    });
    replication.getAllClubs.mockResolvedValue([]);
    const unsubscribe = useClubStore.getState().subscribeToChanges();

    emit([clubRow]);
    expect(useClubStore.getState().clubs).toEqual([]);

    useClubStore.setState({ clubsPrincipalMarker: 'user-a' });
    emit([clubRow]);
    expect(useClubStore.getState().clubs.map(club => club.id)).toEqual(['club-a']);
    unsubscribe();
  });

  it('does not reuse one account freshness for the next account', async () => {
    setOnline(true);
    resetClubReadinessForTests();
    replication.reconcilePrincipal.mockResolvedValue('user-a');
    replication.sync.mockResolvedValue({ success: true });
    await useClubStore.getState().ensureClubsReady();
    expect(replication.sync).toHaveBeenCalledTimes(1);

    replication.reconcilePrincipal.mockResolvedValue('user-b');
    const result = await useClubStore.getState().ensureClubsReady();

    expect(replication.sync).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('fresh');
  });
});
