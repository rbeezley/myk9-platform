import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ClubPaymentsTab } from '../ClubPaymentsTab';

vi.mock('@/features/payments/ClubPaymentsCard', () => ({
  ClubPaymentsCard: ({ clubId }: { clubId: string }) => (
    <div data-testid="club-payments-card">{clubId}</div>
  ),
}));

describe('ClubPaymentsTab', () => {
  it('shows the payments card scoped to the club', () => {
    render(<ClubPaymentsTab clubId="club-1" />);

    expect(screen.getByTestId('club-payments-card')).toHaveTextContent('club-1');
  });

  // MYK9-229: the club admin is the one who fields "why is there a 7% fee?"
  // and who decides whether the club keeps using myK9Show.
  it('tells the club admin the club receives 100% of entry fees, with a link to the details', () => {
    render(<ClubPaymentsTab clubId="club-1" />);

    expect(screen.getByText(/Your club receives 100% of entry fees\./i)).toBeInTheDocument();
    expect(screen.getByText(/never deducted from your payout/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /how our fees work/i })).toHaveAttribute(
      'href',
      '/fees'
    );
  });
});
