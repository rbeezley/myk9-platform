import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { FinancialSummary } from './FinancialSummary';
import { PromoCodesSection } from './PromoCodesSection';
import { ShowFinancialSummary } from './ShowFinancialSummary';

const showFinancialQueryState = vi.hoisted(() => ({
  data: [] as unknown[],
  isLoading: false,
}));

const trialEntriesState = vi.hoisted(() => ({
  data: [] as unknown[],
  isLoading: false,
}));

const promoCodeState = vi.hoisted(() => ({
  show: { data: [] as unknown[], isLoading: false },
  trial: { data: [] as unknown[], isLoading: false },
}));

vi.mock('@tanstack/react-query', async () => {
  const actual =
    await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query');

  return {
    ...actual,
    useQuery: () => showFinancialQueryState,
  };
});

vi.mock('@/hooks/queries/useTrialEntries', () => ({
  useTrialEntries: () => trialEntriesState,
}));

vi.mock('@/hooks/queries/usePromoCodeDatabase', () => ({
  usePromoCodesByShowQuery: () => promoCodeState.show,
  usePromoCodesByTrialQuery: () => promoCodeState.trial,
  useCreatePromoCodeMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useDeletePromoCodeMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'user-1' } }),
}));

beforeEach(() => {
  showFinancialQueryState.data = [];
  showFinancialQueryState.isLoading = false;
  trialEntriesState.data = [];
  trialEntriesState.isLoading = false;
  promoCodeState.show = { data: [], isLoading: false };
  promoCodeState.trial = { data: [], isLoading: false };
});

describe('Secretary financial and promo sections — loading state skeleton convergence', () => {
  it('renders a skeleton, not a spinner, while the trial financial summary is loading', () => {
    trialEntriesState.isLoading = true;

    render(<FinancialSummary trialId="trial-1" />);

    expect(screen.getByRole('status', { name: /loading financial summary/i })).toBeInTheDocument();
    expect(document.querySelector('.animate-spin')).toBeNull();
  });

  it('removes the trial financial skeleton for the loaded empty state', () => {
    render(<FinancialSummary trialId="trial-1" />);

    expect(
      screen.queryByRole('status', { name: /loading financial summary/i })
    ).not.toBeInTheDocument();
    expect(screen.getByText(/entry fees, discounts, and payment status overview/i)).toBeTruthy();
  });

  it('renders a skeleton, not a spinner, while the show financial summary is loading', () => {
    showFinancialQueryState.isLoading = true;

    render(<ShowFinancialSummary showId="show-1" />);

    expect(
      screen.getByRole('status', { name: /loading show financial summary/i })
    ).toBeInTheDocument();
    expect(document.querySelector('.animate-spin')).toBeNull();
  });

  it('removes the show financial skeleton for the loaded empty state', () => {
    render(<ShowFinancialSummary showId="show-1" />);

    expect(
      screen.queryByRole('status', { name: /loading show financial summary/i })
    ).not.toBeInTheDocument();
    expect(screen.getByText(/aggregated entry fees, discounts, and payments/i)).toBeTruthy();
  });

  it('renders a table skeleton, not a spinner, while promo codes are loading', () => {
    promoCodeState.show = { data: [], isLoading: true };

    render(<PromoCodesSection showId="show-1" />);

    expect(screen.getByRole('status', { name: /loading promo codes/i })).toBeInTheDocument();
    expect(document.querySelector('.animate-spin')).toBeNull();
  });

  it('removes the promo-code skeleton for the loaded empty state', () => {
    render(<PromoCodesSection showId="show-1" />);

    expect(screen.queryByRole('status', { name: /loading promo codes/i })).not.toBeInTheDocument();
    expect(screen.getByText(/no promo codes yet/i)).toBeTruthy();
  });
});
