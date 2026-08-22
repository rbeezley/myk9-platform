import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toast } from 'sonner';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { OperatorAlertsSection } from './OperatorAlertsSection';
import type { OperatorAlert } from '@/features/admin-system-health/operatorAlertsTypes';
import {
  useOperatorAlerts,
  useResolveOperatorAlert,
} from '@/features/admin-system-health/useOperatorAlerts';

vi.mock('@/features/admin-system-health/useOperatorAlerts', () => ({
  useOperatorAlerts: vi.fn(),
  useResolveOperatorAlert: vi.fn(),
  OPERATOR_ALERTS_QUERY_KEY: ['admin', 'system-health', 'operator-alerts'],
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mockedUseOperatorAlerts = vi.mocked(useOperatorAlerts);
const mockedUseResolveOperatorAlert = vi.mocked(useResolveOperatorAlert);
const mockedToastError = vi.mocked(toast.error);

type QueryResult = ReturnType<typeof useOperatorAlerts>;
type MutationResult = ReturnType<typeof useResolveOperatorAlert>;

function queryState(partial: {
  data?: OperatorAlert[];
  isLoading?: boolean;
  error?: unknown;
}): QueryResult {
  return {
    data: partial.data,
    isLoading: partial.isLoading ?? false,
    error: partial.error ?? null,
  } as unknown as QueryResult;
}

function alert(overrides: Partial<OperatorAlert> = {}): OperatorAlert {
  return {
    id: 'alert-1',
    createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    source: 'stripe-webhook',
    severity: 'warn',
    title: 'Unmatched refund for payment intent pi_123 — no order found',
    detail: { paymentIntentId: 'pi_123', chargeId: 'ch_456', refundedAmountCents: 5000 },
    dedupeKey: 'evt_789',
    resolvedAt: null,
    resolvedBy: null,
    ...overrides,
  };
}

describe('OperatorAlertsSection', () => {
  const mutateAsync = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    mockedUseOperatorAlerts.mockReset();
    mockedUseResolveOperatorAlert.mockReset();
    mutateAsync.mockClear();
    mockedToastError.mockClear();
    mockedUseResolveOperatorAlert.mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as MutationResult);
  });

  it('renders an unresolved alert with source, severity, title, detail, and age', () => {
    mockedUseOperatorAlerts.mockReturnValue(queryState({ data: [alert()] }));

    render(<OperatorAlertsSection />);

    expect(screen.getByText(/stripe-webhook/)).toBeInTheDocument();
    expect(
      screen.getByText('Unmatched refund for payment intent pi_123 — no order found')
    ).toBeInTheDocument();
    expect(screen.getByText(/paymentIntentId: pi_123/)).toBeInTheDocument();
    expect(screen.getByText(/min ago/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /resolve/i })).toBeInTheDocument();
  });

  it('calls the resolve RPC when the resolve button is clicked', async () => {
    mockedUseOperatorAlerts.mockReturnValue(queryState({ data: [alert({ id: 'alert-42' })] }));

    const { user } = render(<OperatorAlertsSection />);

    await user.click(screen.getByRole('button', { name: /resolve/i }));

    expect(mutateAsync).toHaveBeenCalledWith('alert-42');
  });

  it('shows an error toast (and does not leave an unhandled rejection) when the resolve RPC fails', async () => {
    mutateAsync.mockRejectedValueOnce(new Error('resolve failed'));
    mockedUseOperatorAlerts.mockReturnValue(queryState({ data: [alert({ id: 'alert-42' })] }));

    const { user } = render(<OperatorAlertsSection />);

    await user.click(screen.getByRole('button', { name: /resolve/i }));

    await waitFor(() => {
      // SA-026: the toast shows a friendly message, never the raw error text
      // ('resolve failed'), so Postgres/PostgREST internals aren't leaked.
      expect(mockedToastError).toHaveBeenCalledWith('Failed to resolve alert. Please try again.');
      expect(mockedToastError).not.toHaveBeenCalledWith(expect.stringContaining('resolve failed'));
    });
    // The resolve button must re-enable after the failure (existing finally block).
    expect(screen.getByRole('button', { name: /resolve/i })).not.toBeDisabled();
  });

  it('shows an explicit empty state when there are no unresolved alerts', () => {
    mockedUseOperatorAlerts.mockReturnValue(queryState({ data: [] }));

    render(<OperatorAlertsSection />);

    expect(screen.getByText(/no unresolved alerts/i)).toBeInTheDocument();
  });

  // The cap now counts distinct TYPES: grouping already folds one incident's
  // repeats into a single row, so what this guards is many unrelated things
  // being wrong at once.
  it('caps the visible list at five alert types behind a Show all toggle', async () => {
    const alerts = Array.from({ length: 7 }, (_, i) =>
      alert({ id: `alert-${i}`, title: `Alert type ${i}` })
    );
    mockedUseOperatorAlerts.mockReturnValue(queryState({ data: alerts }));

    const { user } = render(<OperatorAlertsSection />);

    expect(screen.getAllByRole('button', { name: /^resolve$/i })).toHaveLength(5);

    await user.click(screen.getByRole('button', { name: /show all 7 alert types/i }));

    expect(screen.getAllByRole('button', { name: /^resolve$/i })).toHaveLength(7);
    expect(screen.getByRole('button', { name: /show fewer/i })).toBeInTheDocument();
  });

  it('renders a loading state while fetching', () => {
    mockedUseOperatorAlerts.mockReturnValue(queryState({ isLoading: true }));

    render(<OperatorAlertsSection />);

    expect(screen.getByRole('status', { name: /loading.*alerts/i })).toBeInTheDocument();
  });

  it('renders an error state when the query fails', () => {
    mockedUseOperatorAlerts.mockReturnValue(queryState({ error: new Error('boom') }));

    render(<OperatorAlertsSection />);

    expect(screen.getByText(/couldn.t load/i)).toBeInTheDocument();
  });
  // Money-path writers emit repeating pairs, so one incident arrives as a wall
  // of near-identical rows. Each occurrence is a DISTINCT refund, so the rows
  // collapse for reading but every Resolve stays per-alert.
  describe('grouping repeated alert types', () => {
    function repeats(n: number, over: Partial<OperatorAlert> = {}) {
      return Array.from({ length: n }, (_, i) =>
        alert({
          id: `alert-${over.title ?? 'x'}-${i}`,
          createdAt: new Date(Date.now() - (i + 1) * 60 * 60 * 1000).toISOString(),
          ...over,
        })
      );
    }

    it('collapses four occurrences into one row with a count', () => {
      mockedUseOperatorAlerts.mockReturnValue(
        queryState({ data: repeats(4, { title: 'Cart overflow charge auto-refunded' }) })
      );

      render(<OperatorAlertsSection />);

      expect(screen.getAllByText('Cart overflow charge auto-refunded')).toHaveLength(1);
      expect(screen.getByText('4')).toBeInTheDocument();
      // Collapsed: no per-alert Resolve is reachable until the group is opened.
      expect(screen.queryByRole('button', { name: /^resolve$/i })).not.toBeInTheDocument();
    });

    it('reveals one Resolve per occurrence when the group is opened', async () => {
      mockedUseOperatorAlerts.mockReturnValue(
        queryState({ data: repeats(4, { title: 'Cart overflow charge auto-refunded' }) })
      );

      const { user } = render(<OperatorAlertsSection />);
      await user.click(screen.getByRole('button', { name: /show 4 occurrences/i }));

      expect(screen.getAllByRole('button', { name: /^resolve$/i })).toHaveLength(4);
    });

    it('offers no bulk resolve - each occurrence is a separate refund', () => {
      mockedUseOperatorAlerts.mockReturnValue(
        queryState({ data: repeats(4, { title: 'Cart overflow charge auto-refunded' }) })
      );

      render(<OperatorAlertsSection />);

      expect(screen.queryByRole('button', { name: /resolve all/i })).not.toBeInTheDocument();
    });

    it('leaves a lone alert as a plain row, with no count or expander', () => {
      mockedUseOperatorAlerts.mockReturnValue(queryState({ data: [alert()] }));

      render(<OperatorAlertsSection />);

      expect(screen.getByRole('button', { name: /^resolve$/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /occurrences/i })).not.toBeInTheDocument();
    });

    it('keeps distinct titles in separate groups', () => {
      mockedUseOperatorAlerts.mockReturnValue(
        queryState({
          data: [
            ...repeats(2, { title: 'Cart overflow charge auto-refunded' }),
            ...repeats(2, { title: 'Paid cart had overflow lines' }),
          ],
        })
      );

      render(<OperatorAlertsSection />);

      expect(screen.getByText('Cart overflow charge auto-refunded')).toBeInTheDocument();
      expect(screen.getByText('Paid cart had overflow lines')).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: /show 2 occurrences/i })).toHaveLength(2);
    });
  });
});
