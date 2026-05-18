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
    expect(screen.getByText('1 pulled · 1 review')).toBeInTheDocument();
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
