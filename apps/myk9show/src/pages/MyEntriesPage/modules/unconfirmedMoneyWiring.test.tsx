/**
 * MYK9-629 AC1 — the end-to-end wiring that withholds money on My Shows.
 *
 * WHY THIS FILE EXISTS AT ALL. `showMoneyState.test.ts` proves the derivation
 * answers `unknown`; that is not the bug. PR #2301's P1 was a WIRING bug — the
 * derivation was right and a strip spent the rows anyway, twice, on the same
 * page. So this test drives the REAL `useMyEntriesData` (only `getUserEntries`
 * is stubbed) and renders the REAL `MyShowsList` on its output, which is the
 * only shape that can catch a `source` that never reaches the derivation.
 *
 * MUTATION-VERIFIED: forcing `source="confirmed"` at the `MyShowsList` call
 * below reddens the first test on all four assertions ($ figure, cart link,
 * Finish payment, notice). Recorded in the PR body.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { useMyEntriesData } from './useMyEntriesData';
import { MyShowsList } from './MyShowsList';
import { getUserEntries } from '@/services/database/entries';
import type { UserEntriesSource } from '@/services/database/entries/userEntriesRead';
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
vi.mock('@/services/LoggingService', () => {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
  };
  return { logger, LoggingService: { getInstance: () => logger } };
});

const SHOW_ID = 'dededede-0000-0000-0000-000000000011';
const ENROLLMENT_ID = '4b9132b4-64d1-4012-8663-7ec6820a442b';

const show = {
  id: SHOW_ID,
  name: 'Heartland UKC Nosework Trial',
  // Far-future, so a balance is never reclassified as past-show debt (which
  // would drop the cart link for a reason that has nothing to do with `source`).
  start_date: '2099-10-10',
  end_date: '2099-10-11',
  entry_close_date: '2099-10-01',
  venue_name: 'Heartland Arena',
  city: 'Kansas City',
  state: 'MO',
};

const dog = { id: 'dog-ranger', name: 'Ranger', call_name: 'Ranger' };

function baseRow() {
  return {
    show_id: SHOW_ID,
    registration_id: ENROLLMENT_ID,
    dog_id: dog.id,
    trial_id: 'trial-1',
    entry_status: 'accepted',
    entry_fee: 30,
    check_in_status: 'no-status',
    is_scored: false,
    submitted_at: '2026-09-01T12:00:00.000Z',
    created_at: '2026-09-01T12:00:00.000Z',
    updated_at: '2026-09-01T12:00:00.000Z',
    dog,
    show,
    trial: { id: 'trial-1', trial_type: 'Scent Work' },
  };
}

/** Paid online. This is the row whose RECEIPT must stay reachable. */
const paidRow = () => ({
  ...baseRow(),
  id: 'entry-interior-advanced',
  class_id: 'class-interior-advanced',
  payment_status: 'paid',
  payment_method: 'card',
  registration: {
    id: ENROLLMENT_ID,
    confirmation_number: 'MK9-RANGER',
    payment_status: 'paid',
  },
  class: { id: 'class-interior-advanced', name: 'Interior Advanced', class_number: '201' },
});

/** Still owed, in the same show — the balance-due strip's only input. */
const owingRow = () => ({
  ...baseRow(),
  id: 'entry-vehicle-advanced',
  registration_id: null,
  class_id: 'class-vehicle-advanced',
  payment_status: 'pending',
  payment_method: null,
  registration: null,
  class: { id: 'class-vehicle-advanced', name: 'Vehicle Advanced', class_number: '202' },
});

function renderMyShows(source: UserEntriesSource) {
  (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: [paidRow(), owingRow()],
    error: null,
    source,
  });

  const hook = renderHook(() =>
    useMyEntriesData({ persistCheckInStatus: vi.fn().mockResolvedValue(undefined) })
  );
  return hook;
}

function ListOf({ hook }: { hook: ReturnType<typeof renderMyShows> }) {
  return (
    <MyShowsList
      filteredEntries={hook.result.current.entries}
      // THE line under test. Everything money-shaped on this page hangs off it.
      source={hook.result.current.source}
      seenResultReleaseKeys={new Set<string>()}
      onCheckInDay={vi.fn()}
      onOpenCheckIn={vi.fn()}
      onOpenEdit={vi.fn()}
      onOpenReceipts={vi.fn()}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
    user: { id: 'user-exhibitor', email: 'exhibitor@myk9t.com' },
    userWithRoles: { databaseUserId: 'person-exhibitor' },
    isAuthenticated: true,
  });
  (useCurrentUserPersonId as ReturnType<typeof vi.fn>).mockReturnValue('person-exhibitor');
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('My Shows money under an UNCONFIRMED account read (MYK9-629 AC1)', () => {
  it('shows no figure, no cart link and no pay button — but keeps the receipt', async () => {
    const hook = renderMyShows('replica-after-error');
    await waitFor(() => expect(hook.result.current.entries.length).toBeGreaterThan(0));
    expect(hook.result.current.source).toBe('replica-after-error');

    render(<ListOf hook={hook} />);

    // No dollar figure anywhere in the rendered list — not the balance strip's,
    // not the paid strip's.
    expect(screen.queryByText(/\$\d/)).not.toBeInTheDocument();
    // No cart deep link and no pay button.
    expect(document.querySelector('a[href*="/cart?"], a[href^="/cart"]')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /finish payment/i })).not.toBeInTheDocument();
    // No meta word that states a payment state either.
    expect(screen.queryByText('Paid')).not.toBeInTheDocument();
    expect(screen.queryByText('Pay at show')).not.toBeInTheDocument();

    // The notice says why, in the exhibitor's terms.
    expect(screen.getByText(/couldn't reach the server to confirm them/i)).toBeInTheDocument();

    // Decision (a): the receipt for a payment already taken stays REACHABLE.
    expect(screen.getByRole('button', { name: /orders & receipts/i })).toBeEnabled();
  });

  it('withholds money on a plain offline read too, not only after an error', async () => {
    const hook = renderMyShows('replica-offline');
    await waitFor(() => expect(hook.result.current.entries.length).toBeGreaterThan(0));

    render(<ListOf hook={hook} />);

    expect(screen.queryByText(/\$\d/)).not.toBeInTheDocument();
    expect(screen.getByText(/couldn't reach the server to confirm them/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /orders & receipts/i })).toBeEnabled();
  });

  it('states the figure and offers the cart when the view CONFIRMS the rows', async () => {
    const hook = renderMyShows('confirmed');
    await waitFor(() => expect(hook.result.current.entries.length).toBeGreaterThan(0));

    render(<ListOf hook={hook} />);

    // The positive control. Without it, the assertions above would pass on a
    // list that rendered nothing at all.
    expect(screen.getByText(/\$30\.00 due/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /finish payment/i })).toBeInTheDocument();
    expect(
      screen.queryByText(/couldn't reach the server to confirm them/i)
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /orders & receipts/i })).toBeEnabled();
  });
});
