import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { within } from '@testing-library/react';
import { ShowDayReconciliation } from '../ShowDayReconciliation';

describe('ShowDayReconciliation', () => {
  it('renders collected desk fees by payment method', () => {
    render(
      <ShowDayReconciliation
        entries={[
          {
            id: 'late-cash',
            is_day_of_show: true,
            entry_fee: 35,
            payment_status: 'paid',
            payment_method: 'cash',
          },
          {
            id: 'paid-scratch',
            entry_fee: 35,
            entry_status: 'scratched',
            check_in_status: 'pulled',
            payment_status: 'paid',
          },
        ]}
      />
    );

    expect(screen.getByRole('heading', { name: 'Show-day reconciliation' })).toBeInTheDocument();
    const reviewChip = screen.getByText('1 pulled · 1 review');
    expect(reviewChip).toBeInTheDocument();
    // "Needs review" is a caution status, not a call to action: it must use the
    // amber status chip token, never the user's accent (bg-primary), which
    // would shift the meaning per selected accent (Clay/Grove/Dusk/Heather).
    expect(reviewChip.className).toContain('var(--chip-amber-bg)');
    expect(reviewChip.className).not.toContain('bg-primary');
    expect(
      within(screen.getByRole('group', { name: 'Show entries' })).getByText('1 day-of')
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Collected late-entry fees' })).getByText('$35.00')
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Pulled or no-show entries' })).getByText('1')
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Manual refund review' })).getByText(
        '$35.00 paid entries'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Cash')).toBeInTheDocument();
  });
});
