/**
 * The two MYK9-563 roots that a component test cannot reach, pinned where they
 * actually live: the page's data hook.
 *
 * Both were review findings about test SHAPE rather than behaviour. The
 * component-level tests hand-build their inputs, so the value being asserted
 * never travels through the code that produces it — mutating either root left
 * every suite green:
 *
 *  - item 2: `degraded` is read off the shared account read and handed to the
 *    fee strip. Forcing it to `false` broke nothing.
 *  - item 6: `transformEntry` used to substitute `id.slice(0,8).toUpperCase()`
 *    for a missing confirmation number. Restoring that broke nothing, because
 *    every other test builds its `MyEntry` by hand.
 *
 * These run a real account-read ROW through `useMyEntriesData` and, for item 2,
 * render the real `CompactStatsRow` on the real prop shape (LESSONS
 * `last-hop-drop`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@/test/utils/testUtils';
import { useMyEntriesData } from './useMyEntriesData';
import { CompactStatsRow } from '@/components/exhibitor/CompactStatsRow';
import { getUserEntries } from '@/services/database/entries';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useCurrentUserPersonId } from '@/hooks/useRoleBasedData';

vi.mock('@/services/database/entries', () => ({ getUserEntries: vi.fn() }));
vi.mock('@/hooks/useAuthContext');
vi.mock('@/hooks/useRoleBasedData', () => ({ useCurrentUserPersonId: vi.fn() }));
vi.mock('@/services/AuditService', () => ({
  auditService: { log: vi.fn() },
  AuditAction: { READ: 'READ', UPDATE: 'UPDATE' },
}));
vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  LoggingService: { getInstance: () => ({ error: vi.fn(), log: vi.fn(), info: vi.fn() }) },
}));

/** One raw row exactly as `getUserEntries` returns it — NOT a hand-built card. */
function accountRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'abcdef12-3456-7890-abcd-ef1234567890',
    registration_id: null,
    show_id: 'show-1',
    dog_id: 'dog-1',
    class_id: 'class-1',
    trial_id: 'trial-1',
    handler_id: 'person-1',
    entry_status: 'accepted',
    payment_status: 'pending',
    entry_fee: 30,
    check_in_status: 'no-status',
    submitted_at: '2026-06-01T12:00:00.000Z',
    created_at: '2026-06-01T12:00:00.000Z',
    updated_at: '2026-06-01T12:00:00.000Z',
    dog: { id: 'dog-1', name: 'Koda', call_name: 'Koda' },
    show: {
      id: 'show-1',
      name: 'Spring Trial',
      start_date: '2099-06-15',
      end_date: '2099-06-16',
      entry_close_date: '2099-06-01',
    },
    class: { id: 'class-1', name: 'Novice A', class_number: '101' },
    trial: { id: 'trial-1', trial_type: 'Scent Work' },
    ...overrides,
  };
}

function withQueryClient() {
  const client = new QueryClient();
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  };
}

const renderData = () =>
  renderHook(
    () => useMyEntriesData({ persistCheckInStatus: vi.fn().mockResolvedValue(undefined) }),
    { wrapper: withQueryClient() }
  );

beforeEach(() => {
  vi.clearAllMocks();
  (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
    user: { id: 'user-1', email: 'exhibitor@test.com' },
    userWithRoles: { databaseUserId: 'person-1' },
    isAuthenticated: true,
  });
  (useCurrentUserPersonId as ReturnType<typeof vi.fn>).mockReturnValue('person-1');
});

describe('useMyEntriesData carries the degraded signal to the fee strip (item 2)', () => {
  it('marks the read degraded and the strip withholds the amount', async () => {
    (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [accountRow()],
      error: null,
      stale: true,
    });

    const { result } = renderData();
    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    expect(result.current.degraded).toBe(true);

    // Rendered on the REAL prop shape the page passes, not on a literal.
    render(
      <CompactStatsRow
        currentFees={result.current.balanceSummary.currentFeesCents / 100}
        amountDue={result.current.balanceSummary.amountDueCents / 100}
        unconfirmed={result.current.degraded}
        onNavigate={vi.fn()}
      />
    );

    expect(screen.getByText('Amount unavailable')).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it('is NOT degraded when the authoritative view confirmed the rows', async () => {
    (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [accountRow()],
      error: null,
    });

    const { result } = renderData();
    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    expect(result.current.degraded).toBe(false);
  });

  it('is degraded when the enrollment enrichment could not be read', async () => {
    // A distinct reason to distrust the figures: with no order payment_status
    // a pending order over a paid-looking row UNDER-claims the amount due.
    (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [accountRow()],
      error: null,
      enrichmentMissing: true,
    });

    const { result } = renderData();
    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    expect(result.current.degraded).toBe(true);
  });
});

describe('useMyEntriesData never invents a confirmation number (item 6)', () => {
  it('leaves it undefined for a row with no enrollment', async () => {
    (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [accountRow()],
      error: null,
    });

    const { result } = renderData();
    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    // The id slice that used to fill this in would have been "ABCDEF12".
    expect(result.current.entries[0]?.confirmationNumber).toBeUndefined();
  });

  it('carries the enrollment number through when there is one', async () => {
    (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        accountRow({
          registration_id: 'reg-1',
          registration: { id: 'reg-1', confirmation_number: 'MK9-000042' },
        }),
      ],
      error: null,
    });

    const { result } = renderData();
    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    expect(result.current.entries[0]?.confirmationNumber).toBe('MK9-000042');
  });
});
