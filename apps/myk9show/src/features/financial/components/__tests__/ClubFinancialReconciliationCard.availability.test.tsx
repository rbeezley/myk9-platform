/**
 * MYK9-1985 Codex round 4: the card states only what both reads answered.
 *
 * - The show list is the union of the figures read and the reconciliation read, so a show
 *   with a real Stripe charge but no figures row is never dropped.
 * - Only a successful read counts: a paused query (offline first read, React Query
 *   networkMode 'online') has isLoading and isError both false and no data, and must never
 *   read as "no shows" or "No Stripe charges".
 * - The server's end date carries the payout promise when the replicated shows read misses
 *   the show (always for a soft-deleted one).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ClubFinancialReconciliationCard } from '../ClubFinancialReconciliationCard';
import * as reconciliationModule from '../../useClubFinancialReconciliation';
import * as figuresModule from '@/features/payments/useClubShowPayoutFigures';
import * as schedulesModule from '@/features/payments/useShowPayoutSchedules';
import type { ClubShowPayoutFigures } from '@/features/payments/clubShowPayoutFigures';
import {
  payoutFigures,
  payoutFiguresWith,
} from '@/features/payments/clubShowPayoutFiguresFixtures';
import type { ClubShowReconciliationRow } from '../../clubShowReconciliation';

vi.mock('../../useClubFinancialReconciliation', () => ({
  useClubFinancialReconciliation: vi.fn(),
}));

vi.mock('@/features/payments/useClubShowPayoutFigures', () => ({
  useClubShowPayoutFigures: vi.fn(),
}));

vi.mock('@/features/payments/useShowPayoutSchedules', () => ({
  useShowPayoutSchedules: vi.fn(),
}));

const mockedReconciliation = vi.mocked(reconciliationModule.useClubFinancialReconciliation);
const mockedFigures = vi.mocked(figuresModule.useClubShowPayoutFigures);
const mockedSchedules = vi.mocked(schedulesModule.useShowPayoutSchedules);

type FiguresResult = ReturnType<typeof figuresModule.useClubShowPayoutFigures>;
type ReconciliationResult = ReturnType<typeof reconciliationModule.useClubFinancialReconciliation>;

function settledFigures(rows: ClubShowPayoutFigures[]) {
  mockedFigures.mockReturnValue({
    data: rows,
    isLoading: false,
    isError: false,
    isSuccess: true,
    fetchStatus: 'idle',
    refetch: vi.fn(),
  } as unknown as FiguresResult);
}

/** An offline first read: React Query pauses it, so there is no data and no verdict. */
function pausedFigures() {
  mockedFigures.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    isSuccess: false,
    fetchStatus: 'paused',
    refetch: vi.fn(),
  } as unknown as FiguresResult);
}

function reconciliationRow(
  overrides: Partial<ClubShowReconciliationRow> = {}
): ClubShowReconciliationRow {
  return {
    showId: 'show-1',
    showName: 'Cedar Valley Classic',
    chargeVerification: 'AllFeeBreakdowns',
    settlement: null,
    orderCount: 1,
    ...overrides,
  };
}

function settledReconciliation(rows: ClubShowReconciliationRow[]) {
  mockedReconciliation.mockReturnValue({
    rows,
    isLoading: false,
    isError: false,
    isSuccess: true,
    refetch: vi.fn(),
  } as unknown as ReconciliationResult);
}

function pausedReconciliation() {
  mockedReconciliation.mockReturnValue({
    rows: [],
    isLoading: false,
    isError: false,
    isSuccess: false,
    refetch: vi.fn(),
  } as unknown as ReconciliationResult);
}

function renderCard() {
  return render(<ClubFinancialReconciliationCard clubId="club-1" accountState="enabled" />);
}

/** A show with a real Stripe charge that the figures read has no row for. */
const RIVERBEND = reconciliationRow({ showId: 'show-2', showName: 'Riverbend Trial' });

beforeEach(() => {
  vi.clearAllMocks();
  mockedSchedules.mockReturnValue(
    new Map([['show-1', { lastDay: '2026-12-09', timeZone: 'America/New_York' }]])
  );
  settledFigures([]);
  settledReconciliation([]);
  vi.useFakeTimers({ now: new Date('2026-12-11T15:00:00Z'), toFake: ['Date'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the show list is the union of both reads', () => {
  it('a show with a charge and no figures row still renders, with no money figures', () => {
    settledFigures([payoutFiguresWith('completed')]);
    settledReconciliation([reconciliationRow(), RIVERBEND]);
    renderCard();

    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    const riverbend = rows.find(row => within(row).queryByText('Riverbend Trial'));
    expect(riverbend).toBeDefined();
    const row = within(riverbend!);
    expect(row.getByText('Stripe fee breakdown for every charge')).toBeInTheDocument();
    expect(row.getByText('Payout figures not available yet.')).toBeInTheDocument();
    expect(row.queryByTestId('payout-figures')).not.toBeInTheDocument();
    expect(row.queryByTestId('payout-stage')).not.toBeInTheDocument();
    expect(riverbend).not.toHaveTextContent(/\$|Collected|Refunded|Paid|Sent|December/);
  });

  it('no figures rows but a charged show: the show, never "No shows to reconcile yet"', () => {
    settledReconciliation([RIVERBEND]);
    renderCard();

    expect(screen.getByText('Riverbend Trial')).toBeInTheDocument();
    expect(screen.queryByText(/no shows to reconcile yet/i)).not.toBeInTheDocument();
  });

  it('both reads empty: the calm empty line', () => {
    renderCard();
    expect(screen.getByText(/no shows to reconcile yet/i)).toBeInTheDocument();
  });
});

describe('only a successful read counts', () => {
  it('a paused figures read is the unavailable state, never "No shows"', () => {
    pausedFigures();
    settledReconciliation([reconciliationRow()]);
    renderCard();

    expect(screen.getByTestId('reconciliation-unavailable')).toBeInTheDocument();
    expect(screen.queryByText(/no shows to reconcile yet/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('payout-figures')).not.toBeInTheDocument();
  });

  it('a paused reconciliation read beside cached figures never says "No Stripe charges"', () => {
    settledFigures([payoutFigures()]);
    pausedReconciliation();
    renderCard();

    expect(screen.queryByText('No Stripe charges')).not.toBeInTheDocument();
    expect(screen.getByTestId('reconciliation-unavailable')).toBeInTheDocument();
    expect(screen.queryByText(/no shows to reconcile yet/i)).not.toBeInTheDocument();
  });

  it('a paused reconciliation read with no figures rows never says "No shows" either', () => {
    pausedReconciliation();
    renderCard();

    expect(screen.getByTestId('reconciliation-unavailable')).toBeInTheDocument();
    expect(screen.queryByText(/no shows to reconcile yet/i)).not.toBeInTheDocument();
  });
});

describe("the server's end date carries the promise when the shows read misses", () => {
  it('a soft-deleted show long past its date, nothing paid, reports the delay', () => {
    mockedSchedules.mockReturnValue(new Map());
    settledFigures([
      payoutFiguresWith('awaiting_approval', {
        show_end_date: '2026-10-03T00:00:00+00:00',
        show_deleted: true,
      }),
    ]);
    renderCard();

    const line = screen.getByTestId('payout-stage');
    expect(line).toHaveTextContent(
      "Your payout is taking longer than usual. We'll be in touch by email."
    );
    expect(line).not.toHaveTextContent(/five business days/);
  });
});
