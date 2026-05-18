import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { LateEntryReconciliation } from '../LateEntryReconciliation';

describe('LateEntryReconciliation', () => {
  it('renders collected desk fees by payment method', () => {
    render(
      <LateEntryReconciliation
        entries={[
          {
            id: 'late-cash',
            is_day_of_show: true,
            entry_fee: 35,
            payment_status: 'paid',
            payment_method: 'cash',
          },
        ]}
      />
    );

    expect(screen.getByRole('heading', { name: 'Late entry reconciliation' })).toBeInTheDocument();
    expect(screen.getByText('1 late entry')).toBeInTheDocument();
    expect(screen.getAllByText('$35.00')).toHaveLength(2);
    expect(screen.getByText('Cash')).toBeInTheDocument();
  });
});
