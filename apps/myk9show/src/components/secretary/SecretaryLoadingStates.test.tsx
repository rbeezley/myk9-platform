import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { FinancialSummary } from './FinancialSummary';

const trialEntriesState = vi.hoisted(() => ({
  data: [] as unknown[],
  isLoading: false,
}));

vi.mock('@/hooks/queries/useTrialEntries', () => ({
  useTrialEntries: () => trialEntriesState,
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'user-1' } }),
}));

beforeEach(() => {
  trialEntriesState.data = [];
  trialEntriesState.isLoading = false;
});

describe('Secretary financial summary — loading state skeleton convergence', () => {
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
});
