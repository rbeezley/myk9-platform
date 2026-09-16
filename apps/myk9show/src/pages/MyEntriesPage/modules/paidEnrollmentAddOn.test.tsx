/**
 * MYK9-536 — a class added to an ALREADY-PAID enrollment.
 *
 * The staging repro: the secretary marked the enrollment paid by cash ($30),
 * the exhibitor then added a second class and chose to pay by check. The
 * entries row was written correctly (`payment_status: 'pending'`,
 * `payment_method: 'check'`) and the enrollment total went 30 → 60, yet My
 * Entries listed only the first class, its Edit Entry dialog listed only the
 * first class, and the dashboard still read "Paid in full".
 *
 * The root cause was upstream, in `getUserEntries` (the account-level read
 * preferred a show-scoped — therefore never-synced on `/my-entries` —
 * replication snapshot over the authoritative view).
 *
 * WHAT THIS FILE IS NOT. It stubs `@/services/database/entries` wholesale, so
 * it never loads `search.ts` and it passes verbatim on `origin/main`. It is
 * NOT the red-green evidence for the fix — `search.test.ts` is (4 failures
 * against the pre-fix read). What this file does is pin the rest of the chain
 * on the EXACT row shape that read returns, so the downstream behaviour that
 * was already correct cannot silently rot:
 *
 *  - both rows group into ONE card whose `classes` carries BOTH classes — the
 *    array the Edit Entry dialog maps (`MyEntriesDialogs.tsx`), so a card with
 *    one class is a dialog with one class;
 *  - each class keeps its OWN effective payment status, so the enrollment's
 *    `paid_by_cash` cannot mask the pending add-on (MYK9-495);
 *  - the dashboard balance counts the add-on, and `CompactStatsRow` rendered on
 *    the real prop shape does NOT say "Paid in full" (LESSONS `last-hop-drop`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
// The project's custom render (QueryClient + Auth + Router providers), never
// raw `render` — see CLAUDE.md § Testing.
import { render } from '@/test/utils/testUtils';
import { useMyEntriesData } from './useMyEntriesData';
import { useMyEntriesFilters } from './useMyEntriesFilters';
import { CompactStatsRow } from '@/components/exhibitor/CompactStatsRow';
import { buildEntryBalanceRecoveryHref } from '@/features/payments/entryBalanceSummary';
import { getUserEntries } from '@/services/database/entries';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useCurrentUserPersonId } from '@/hooks/useRoleBasedData';
import { PaymentStatus } from '@/types/show-registration-types';

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
  // The full surface, not a hand-picked subset. A method this mock omits throws
  // from an EFFECT, which unmounts the whole tree and leaves an EMPTY DOM
  // instead of a failing render — a missing-method bug wearing the costume of
  // "the dialog rendered nothing".
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
  };
  return { logger, LoggingService: { getInstance: () => logger } };
});

const ENROLLMENT_ID = '4b9132b4-64d1-4012-8663-7ec6820a442b';
const SHOW_ID = 'dededede-0000-0000-0000-000000000011';

/** The enrollment the secretary marked paid — one row per (show, handler). */
const enrollment = {
  id: ENROLLMENT_ID,
  confirmation_number: 'MK9-RANGER',
  payment_status: 'paid_by_cash',
};

const show = {
  id: SHOW_ID,
  name: 'Heartland UKC Nosework Trial',
  // Far-future so the balance is never reclassified as a past show.
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
    registration: enrollment,
  };
}

/** The class the secretary already took $30 cash for. */
const paidEntryRow = () => ({
  ...baseRow(),
  id: 'entry-interior-advanced',
  class_id: 'class-interior-advanced',
  payment_status: 'paid_by_cash',
  payment_method: 'cash',
  class: {
    id: 'class-interior-advanced',
    name: 'Interior Advanced',
    class_number: '201',
  },
});

/** The class the exhibitor added afterwards, by check — still owed. */
const pendingAddOnRow = () => ({
  ...baseRow(),
  id: 'entry-vehicle-advanced',
  class_id: 'class-vehicle-advanced',
  payment_status: 'pending',
  payment_method: 'check',
  class: {
    id: 'class-vehicle-advanced',
    name: 'Vehicle Advanced',
    class_number: '202',
  },
});

/**
 * `useMyEntriesData` projects the SHARED account-entries cache entry
 * (MYK9-563 item 3), so every render needs a client. A fresh one per render
 * keeps the cases independent.
 */
function withQueryClient(inner?: (children: React.ReactNode) => React.ReactNode) {
  const client = new QueryClient();
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        {inner ? inner(children) : children}
      </QueryClientProvider>
    );
  };
}

const renderData = () =>
  renderHook(
    () =>
      useMyEntriesData({
        persistCheckInStatus: vi.fn().mockResolvedValue(undefined),
      }),
    { wrapper: withQueryClient() }
  );

describe('MyEntries — a pending class added to a paid enrollment (MYK9-536)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { id: 'user-exhibitor', email: 'exhibitor@myk9t.com' },
      userWithRoles: { databaseUserId: 'person-exhibitor' },
      isAuthenticated: true,
    });
    (useCurrentUserPersonId as ReturnType<typeof vi.fn>).mockReturnValue('person-exhibitor');
    (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [paidEntryRow(), pendingAddOnRow()],
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('keeps both classes on the one enrollment card the Edit Entry dialog reads', async () => {
    const { result } = renderData();

    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    const card = result.current.entries[0];
    expect(card.registrationId).toBe(ENROLLMENT_ID);
    // `classes` is exactly what EditEntryDialog maps into EntryEditDialog.
    expect(card.classes.map(cls => cls.name)).toEqual(['Interior Advanced', 'Vehicle Advanced']);
    // ...and the per-dog projection the multi-dog grid renders must not drop it.
    expect(card.dogs.flatMap(entryDog => entryDog.classes.map(cls => cls.name))).toEqual([
      'Interior Advanced',
      'Vehicle Advanced',
    ]);
    expect(card.totalFee).toBe(60);
  });

  it('gives the add-on its own effective payment status instead of the order-wide paid', async () => {
    const { result } = renderData();

    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    const byName = new Map(result.current.entries[0].classes.map(cls => [cls.name, cls]));
    expect(byName.get('Interior Advanced')?.paymentStatus).toBe(PaymentStatus.PAID_BY_CASH);
    // MYK9-495: the enrollment's `paid_by_cash` may not vouch for a row added
    // after it. `pending` on the row wins.
    expect(byName.get('Vehicle Advanced')?.paymentStatus).toBe(PaymentStatus.PENDING);
    expect(byName.get('Vehicle Advanced')?.paymentMethod).toBe('check');
  });

  it('counts the add-on in the dashboard balance', async () => {
    const { result } = renderData();

    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    expect(result.current.balanceSummary.currentFeesCents).toBe(6000);
    expect(result.current.balanceSummary.amountDueCents).toBe(3000);
    // Paying a club by check is a pay-at-show status, not an online debt.
    expect(result.current.balanceSummary.payAtShowDueCents).toBe(3000);
    expect(result.current.balanceSummary.onlineDueCents).toBe(0);
  });

  /**
   * Drive the strip the way the page does. `index.tsx` passes
   * `entryStats.currentFees` / `entryStats.currentAmountDue` out of
   * `useMyEntriesFilters`, not raw cents off the summary — and for THIS fixture
   * `onlineDueCents` is 0, because a check is pay-at-show. So a projection that
   * reached for `onlineDueCents` instead of `amountDueCents` would reproduce
   * the reported bug exactly while every cents-level assertion stayed green.
   * Going through the real hook is what makes that mutation visible.
   */
  // `useMyEntriesFilters` keeps the active tab in the URL, so the hook needs a
  // router exactly as the page gives it one.
  /**
   * Built PER RENDER, not once for the describe. `useMyEntriesData` now reads
   * the shared account-entries cache entry (MYK9-563 item 3), so a client
   * hoisted to describe scope would serve the previous case's rows to the next
   * one before its own mock is ever called.
   */
  const routerWrapper = () => withQueryClient(children => <MemoryRouter>{children}</MemoryRouter>);

  function useDashboardStrip() {
    const data = useMyEntriesData({
      persistCheckInStatus: vi.fn().mockResolvedValue(undefined),
    });
    const filters = useMyEntriesFilters({
      entries: data.entries,
      balanceSummary: data.balanceSummary,
    });
    return { data, filters };
  }

  it('shows the outstanding balance on the dashboard strip the page actually renders', async () => {
    const { result } = renderHook(() => useDashboardStrip(), { wrapper: routerWrapper() });

    await waitFor(() => expect(result.current.data.entries).toHaveLength(1));

    const summary = result.current.data.balanceSummary;
    const stats = result.current.filters.entryStats;
    render(
      <CompactStatsRow
        currentFees={stats.currentFees}
        amountDue={stats.currentAmountDue}
        hasPastBalance={summary.onlineShowBalances.some(show => show.isPastShow)}
        currentFeesHref={buildEntryBalanceRecoveryHref(summary)}
        onNavigate={vi.fn()}
      />
    );

    expect(screen.queryByText('Paid in full')).not.toBeInTheDocument();
    expect(screen.getByText('$30.00')).toBeInTheDocument();
    expect(screen.getByText('due of $60.00 entered')).toBeInTheDocument();
  });

  it('still says "Paid in full" once the add-on is settled', async () => {
    const settled = pendingAddOnRow();
    settled.payment_status = 'paid_by_check';
    (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [paidEntryRow(), settled],
      error: null,
    });

    const { result } = renderHook(() => useDashboardStrip(), { wrapper: routerWrapper() });

    await waitFor(() => expect(result.current.data.entries).toHaveLength(1));

    const summary = result.current.data.balanceSummary;
    const stats = result.current.filters.entryStats;
    expect(summary.amountDueCents).toBe(0);

    render(
      <CompactStatsRow
        currentFees={stats.currentFees}
        amountDue={stats.currentAmountDue}
        hasPastBalance={summary.onlineShowBalances.some(show => show.isPastShow)}
        currentFeesHref={buildEntryBalanceRecoveryHref(summary)}
        onNavigate={vi.fn()}
      />
    );

    expect(screen.getByText('Paid in full')).toBeInTheDocument();
  });
});
