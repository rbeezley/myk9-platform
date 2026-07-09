import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
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

const mockedUseOperatorAlerts = vi.mocked(useOperatorAlerts);
const mockedUseResolveOperatorAlert = vi.mocked(useResolveOperatorAlert);

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

  it('shows an explicit empty state when there are no unresolved alerts', () => {
    mockedUseOperatorAlerts.mockReturnValue(queryState({ data: [] }));

    render(<OperatorAlertsSection />);

    expect(screen.getByText(/no unresolved alerts/i)).toBeInTheDocument();
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
});
