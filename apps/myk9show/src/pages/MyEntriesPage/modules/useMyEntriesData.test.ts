import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { shouldRenderOwnEntry, useMyEntriesData } from './useMyEntriesData';
import { getUserEntries } from '@/services/database/entries';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useCurrentUserPersonId } from '@/hooks/useRoleBasedData';

vi.mock('@/services/database/entries', () => ({
  getUserEntries: vi.fn(),
}));
vi.mock('@/hooks/useAuthContext');
vi.mock('@/hooks/useRoleBasedData', () => ({
  useCurrentUserPersonId: vi.fn(),
}));
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
  trial: { id: 'trial-1', trial_type: 'Scent Work' },
  registration: { id: 'reg-1', confirmation_number: 'ABC123' },
});

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
      isAuthenticated: true,
    });
    (useCurrentUserPersonId as ReturnType<typeof vi.fn>).mockReturnValue('person-1');
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

describe('useMyEntriesData — a failed reload must not discard loaded entries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { id: 'user-1', email: 'exhibitor@test.com' },
      userWithRoles: { databaseUserId: 'person-1' },
      isAuthenticated: true,
    });
    (useCurrentUserPersonId as ReturnType<typeof vi.fn>).mockReturnValue('person-1');
  });

  // INTENT (PRODUCT.md principle 4, "Offline is normal, not broken"): the error
  // copy this state renders promises "Your saved information is still here."
  // Clearing `entries` on a failed reload made that sentence false — the whole
  // list vanished behind a card telling the exhibitor nothing was lost. The
  // entries survive; only `isError` flips.
  it('keeps the previously loaded entries when a reload returns an error', async () => {
    (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: [entryRow()],
      error: null,
    });

    const { result } = renderData();
    await waitFor(() => expect(result.current.entries).toHaveLength(1));
    expect(result.current.isError).toBe(false);

    (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
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
      isAuthenticated: true,
    });
    (useCurrentUserPersonId as ReturnType<typeof vi.fn>).mockReturnValue('person-A');
  });

  // Raised by Codex review on PR #1696. Preserving entries across a failed
  // reload is only correct for a RETRY BY THE SAME PERSON. If the signed-in
  // identity changes and the new account's fetch fails, the rows still in state
  // belong to the previous exhibitor — rendering them would show one person's
  // dogs, shows and balance to another.
  it('drops the previous account rows when the identity changes and the new fetch fails', async () => {
    (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: [entryRow()],
      error: null,
    });

    const { result, rerender } = renderData();
    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    // Same page, different person, and their read fails.
    (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { id: 'user-B', email: 'b@test.com' },
      userWithRoles: { databaseUserId: 'person-B' },
      isAuthenticated: true,
    });
    (useCurrentUserPersonId as ReturnType<typeof vi.fn>).mockReturnValue('person-B');
    (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValue({
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
      data: [entryRow()],
      error: null,
    });

    const { result } = renderData();
    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: null,
      error: new Error('network down'),
    });

    await act(async () => {
      await result.current.refreshEntries();
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.entries).toHaveLength(1);
  });
});
