import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { shouldRenderOwnEntry, useMyEntriesData } from './useMyEntriesData';
import { getUserEntries } from '@/services/database/entries';
import { useAuthContext } from '@/hooks/useAuthContext';

vi.mock('@/services/database/entries', () => ({
  getUserEntries: vi.fn(),
}));
vi.mock('@/hooks/useAuthContext');
vi.mock('@/services/AuditService', () => ({
  auditService: { log: vi.fn() },
  AuditAction: { READ: 'READ', UPDATE: 'UPDATE' },
}));
vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  LoggingService: { getInstance: () => ({ error: vi.fn(), log: vi.fn(), info: vi.fn() }) },
}));

const entryRow = () => ({
  id: 'entry-1',
  registration_id: 'reg-1',
  show_id: 'show-1',
  dog_id: 'dog-1',
  class_id: 'class-1',
  trial_id: 'trial-1',
  handler_id: 'person-1',
  entry_status: 'accepted',
  payment_status: 'paid_online',
  entry_fee: 25,
  check_in_status: 'no-status',
  is_scored: false,
  result_status: null,
  search_time_seconds: null,
  total_faults: null,
  final_placement: null,
  submitted_at: '2026-06-01T12:00:00.000Z',
  created_at: '2026-06-01T12:00:00.000Z',
  updated_at: '2026-06-01T12:00:00.000Z',
  dog: { id: 'dog-1', name: 'Koda', call_name: 'Koda' },
  show: {
    id: 'show-1',
    name: 'Spring Trial',
    start_date: '2026-06-15',
    end_date: '2026-06-16',
    entry_close_date: '2026-06-01',
    venue: 'Test Venue',
    city: 'Portland',
    state: 'OR',
  },
  class: { id: 'class-1', name: 'Novice A', class_number: '101' },
  trial: { id: 'trial-1', trial_type: 'Scent Work' } as {
    id: string;
    trial_type: string;
    timezone?: string;
  },
  registration: { id: 'reg-1', confirmation_number: 'ABC123' },
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

const renderData = () =>
  renderHook(() =>
    useMyEntriesData({ persistCheckInStatus: vi.fn().mockResolvedValue(undefined) })
  );

describe('shouldRenderOwnEntry', () => {
  it('keeps deleted entries when the owning show was deleted', () => {
    expect(
      shouldRenderOwnEntry({
        deleted_at: '2026-06-01T00:00:00Z',
        show: { deleted_at: '2026-06-02T00:00:00Z' },
      })
    ).toBe(true);
  });

  it('hides individually deleted entries on a live show', () => {
    expect(
      shouldRenderOwnEntry({ deleted_at: '2026-06-01T00:00:00Z', show: { deleted_at: null } })
    ).toBe(false);
  });
});

// MYK9-384 (E28): shows.entry_close_date is a DATE column that round-trips as a
// midnight-UTC timestamp. Mapping it with `new Date()` put the deadline on the
// previous evening west of UTC, so My Shows said "Entries close Jan 1, 2027"
// while the show detail page and the server guard both said Jan 2.
describe('useMyEntriesData — entry_close_date is a calendar date, not an instant', () => {
  const originalTimezone = process.env.TZ;

  beforeEach(() => {
    vi.clearAllMocks();
    (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { id: 'user-1', email: 'exhibitor@test.com' },
      userWithRoles: { databaseUserId: 'person-1' },
      personId: 'person-1',
      personIdentityState: 'resolved',
      hasUsablePersonId: true,
      isAuthenticated: true,
    });
  });

  afterEach(() => {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  });

  // The reported repro (negative offset), UTC, and two POSITIVE offsets.
  it.each(['America/Chicago', 'UTC', 'Asia/Tokyo', 'Pacific/Kiritimati'])(
    'maps 2027-01-02T00:00:00+00:00 to local Jan 2 in %s',
    async timezone => {
      process.env.TZ = timezone;
      const row = entryRow();
      row.show.entry_close_date = '2027-01-02T00:00:00+00:00';
      (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        source: 'confirmed',
        data: [row],
        error: null,
      });

      const { result } = renderData();
      await waitFor(() => expect(result.current.entries).toHaveLength(1));

      const closeDate = result.current.entries[0]?.entryCloseDate;
      expect(closeDate).toBeInstanceOf(Date);
      expect(closeDate!.getFullYear()).toBe(2027);
      expect(closeDate!.getMonth()).toBe(0); // January — a month AND year boundary
      expect(closeDate!.getDate()).toBe(2);
    }
  );
});

// The show-day check-in gate compares calendar days in the TRIAL's timezone, so
// the resolved zone has to survive the row -> EntryClass mapping. Without it the
// gate silently falls back to the device clock (dayCheckIn.isTrialDayToday).
describe('useMyEntriesData — trial timezone lands on the class row', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { id: 'user-1', email: 'exhibitor@test.com' },
      userWithRoles: { databaseUserId: 'person-1' },
      personId: 'person-1',
      personIdentityState: 'resolved',
      hasUsablePersonId: true,
      isAuthenticated: true,
    });
  });

  it("carries the trial's own zone onto every class row", async () => {
    const row = entryRow();
    row.trial.timezone = 'America/Los_Angeles';
    (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      source: 'confirmed',
      data: [row],
      error: null,
    });

    const { result } = renderData();
    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    expect(result.current.entries[0]?.classes[0]?.trialTimezone).toBe('America/Los_Angeles');
  });

  // Changed by Codex round five on PR #2201: the row used to carry
  // 'America/New_York' here, which no consumer could tell from a real zone.
  // The check-in gate still applies that default itself (`dayCheckIn`), so its
  // behaviour is unchanged; deadline decisions now see the unknown.
  it('leaves the zone undefined when the trial carries none', async () => {
    (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      source: 'confirmed',
      data: [entryRow()],
      error: null,
    });

    const { result } = renderData();
    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    expect(result.current.entries[0]?.classes[0]?.trialTimezone).toBeUndefined();
  });
});

describe('useMyEntriesData — move-up lineage reaches card-level money math', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { id: 'user-1', email: 'exhibitor@test.com' },
      userWithRoles: { databaseUserId: 'person-1' },
      personId: 'person-1',
      personIdentityState: 'resolved',
      hasUsablePersonId: true,
      isAuthenticated: true,
    });
  });

  it('preserves moved_from_entry_id on the live destination class', async () => {
    const row = { ...entryRow(), entry_fee: 0, moved_from_entry_id: 'source-1' };
    (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      source: 'confirmed',
      data: [row],
      error: null,
    });

    const { result } = renderData();
    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    expect(result.current.entries[0]?.classes[0]?.movedFromEntryId).toBe('source-1');
  });
});

describe('useMyEntriesData — a failed reload must not discard loaded entries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { id: 'user-1', email: 'exhibitor@test.com' },
      userWithRoles: { databaseUserId: 'person-1' },
      personId: 'person-1',
      personIdentityState: 'resolved',
      hasUsablePersonId: true,
      isAuthenticated: true,
    });
  });

  // INTENT (PRODUCT.md principle 4, "Offline is normal, not broken"): the error
  // copy this state renders promises "Your saved information is still here."
  // Clearing `entries` on a failed reload made that sentence false — the whole
  // list vanished behind a card telling the exhibitor nothing was lost. The
  // entries survive; only `isError` flips.
  // MYK9-495 round 2: an order reads `pending` as soon as ANY entry under it is
  // unpaid, so a waived or refunded entry in that order must stay settled on the
  // card rather than being badged as owing money for a sibling's balance.
  it.each([
    ['waived', 'waived'],
    ['refunded', 'refunded'],
  ])('keeps a %s entry settled under a pending order', async (rowStatus, expected) => {
    (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      source: 'confirmed',
      data: [
        {
          ...entryRow(),
          payment_status: rowStatus,
          registration: { id: 'reg-1', confirmation_number: 'ABC123', payment_status: 'pending' },
        },
      ],
      error: null,
    });

    const { result } = renderData();
    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    expect(result.current.entries[0]?.paymentStatus).toBe(expected);
  });

  it('badges a pending entry as pending even when its order reads paid', async () => {
    (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      source: 'confirmed',
      data: [
        {
          ...entryRow(),
          payment_status: 'pending',
          registration: { id: 'reg-1', confirmation_number: 'ABC123', payment_status: 'paid' },
        },
      ],
      error: null,
    });

    const { result } = renderData();
    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    expect(result.current.entries[0]?.paymentStatus).toBe('pending');
  });

  it('keeps the previously loaded entries when a reload returns an error', async () => {
    (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      source: 'confirmed',
      data: [entryRow()],
      error: null,
    });

    const { result } = renderData();
    await waitFor(() => expect(result.current.entries).toHaveLength(1));
    expect(result.current.isError).toBe(false);

    (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      source: 'confirmed',
      data: null,
      error: new Error('network down'),
    });

    await act(async () => {
      await result.current.refreshEntries();
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]?.showName).toBe('Spring Trial');
  });

  it('keeps the previously loaded entries when a reload throws', async () => {
    (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      source: 'confirmed',
      data: [entryRow()],
      error: null,
    });

    const { result } = renderData();
    await waitFor(() => expect(result.current.entries).toHaveLength(1));
    const balanceBefore = result.current.balanceSummary;

    (getUserEntries as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('offline'));

    await act(async () => {
      await result.current.refreshEntries();
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.entries).toHaveLength(1);
    // The money summary must not silently zero out either — a $0 amount due is
    // a claim about the exhibitor's balance, not an absence of data.
    expect(result.current.balanceSummary).toEqual(balanceBefore);
  });

  it('still reports an empty list when the very first load fails', async () => {
    (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      source: 'confirmed',
      data: null,
      error: new Error('network down'),
    });

    const { result } = renderData();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.entries).toHaveLength(0);
  });
});

describe('useMyEntriesData — preserved entries must not cross an identity change', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { id: 'user-A', email: 'a@test.com' },
      userWithRoles: { databaseUserId: 'person-A' },
      personId: 'person-A',
      personIdentityState: 'resolved',
      hasUsablePersonId: true,
      isAuthenticated: true,
    });
  });

  // Raised by Codex review on PR #1696. Preserving entries across a failed
  // reload is only correct for a RETRY BY THE SAME PERSON. If the signed-in
  // identity changes and the new account's fetch fails, the rows still in state
  // belong to the previous exhibitor — rendering them would show one person's
  // dogs, shows and balance to another.
  it('drops the previous account rows when the identity changes and the new fetch fails', async () => {
    (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      source: 'confirmed',
      data: [entryRow()],
      error: null,
    });

    const { result, rerender } = renderData();
    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    // Same page, different person, and their read fails.
    (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { id: 'user-B', email: 'b@test.com' },
      userWithRoles: { databaseUserId: 'person-B' },
      personId: 'person-B',
      personIdentityState: 'resolved',
      hasUsablePersonId: true,
      isAuthenticated: true,
    });
    (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValue({
      source: 'confirmed',
      data: null,
      error: new Error('network down'),
    });

    rerender();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.entries).toEqual([]);
    expect(result.current.balanceSummary.amountDueCents).toBe(0);
  });

  it('still preserves entries across a failed retry by the SAME identity', async () => {
    (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      source: 'confirmed',
      data: [entryRow()],
      error: null,
    });

    const { result } = renderData();
    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      source: 'confirmed',
      data: null,
      error: new Error('network down'),
    });

    await act(async () => {
      await result.current.refreshEntries();
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.entries).toHaveLength(1);
  });

  it('ignores a deferred A response and refresh finalizer after switching to B', async () => {
    const accountARefresh = deferred<{
      source: 'confirmed';
      data: ReturnType<typeof entryRow>[];
      error: null;
    }>();
    const accountBRead = deferred<{
      source: 'confirmed';
      data: ReturnType<typeof entryRow>[];
      error: null;
    }>();
    const accountARow = {
      ...entryRow(),
      id: 'entry-a',
      show_id: 'show-a',
      dog: { id: 'dog-a', name: 'Aster', call_name: 'Aster' },
      show: { ...entryRow().show, id: 'show-a', name: 'Account A Show' },
    };
    const accountBRow = {
      ...entryRow(),
      id: 'entry-b',
      show_id: 'show-b',
      dog: { id: 'dog-b', name: 'Briar', call_name: 'Briar' },
      show: { ...entryRow().show, id: 'show-b', name: 'Account B Show' },
    };

    (getUserEntries as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ source: 'confirmed', data: [accountARow], error: null })
      .mockImplementation((personId: string) =>
        personId === 'person-A' ? accountARefresh.promise : accountBRead.promise
      );

    const { result, rerender } = renderData();
    await waitFor(() => expect(result.current.entries[0]?.showName).toBe('Account A Show'));

    await act(async () => {
      void result.current.refreshEntries();
    });
    await waitFor(() => expect(getUserEntries).toHaveBeenCalledWith('person-A'));

    (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { id: 'user-B', email: 'b@test.com' },
      userWithRoles: { databaseUserId: 'person-B' },
      personId: 'person-B',
      personIdentityState: 'resolved',
      hasUsablePersonId: true,
      isAuthenticated: true,
    });
    act(() => rerender());

    // The old A rows are hidden in the identity-change render, before B's read
    // can answer. This is the important synchronous half of the fence.
    expect(result.current.entries).toEqual([]);
    expect(result.current.balanceSummary.kind).toBe('unknown');

    await act(async () => {
      accountBRead.resolve({ source: 'confirmed', data: [accountBRow], error: null });
    });
    await waitFor(() => expect(result.current.entries[0]?.showName).toBe('Account B Show'));

    await act(async () => {
      accountARefresh.resolve({ source: 'confirmed', data: [accountARow], error: null });
      await accountARefresh.promise;
    });

    expect(result.current.entries[0]?.showName).toBe('Account B Show');
    expect(result.current.refreshing).toBe(false);
  });
});
