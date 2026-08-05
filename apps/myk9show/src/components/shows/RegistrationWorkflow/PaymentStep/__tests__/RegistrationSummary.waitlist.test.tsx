import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { RegistrationSummary } from '../RegistrationSummary';

describe('RegistrationSummary wait-list lines', () => {
  it('labels a full/wait-list class as a request and excludes it from payment', () => {
    render(
      <RegistrationSummary
        feeCalculation={{
          subtotal: 25,
          discounts: [],
          taxes: 0,
          total: 25,
          breakdown: [
            {
              dogId: 'dog-1',
              dogName: 'Ace',
              subtotal: 25,
              classes: [
                { classId: 'open', className: 'Open', fee: 25 },
                { classId: 'full', className: 'Full', fee: 0, isWaitlist: true },
              ],
            },
          ],
        }}
      />
    );

    expect(screen.getByText('(Wait list request)')).toBeInTheDocument();
    expect(screen.getByText('No payment due')).toBeInTheDocument();
    expect(screen.getAllByText('$25.00').length).toBeGreaterThan(0);
  });

  it('does not present any amount as final while capacity is unresolved', () => {
    render(
      <RegistrationSummary
        capacityReady={false}
        feeCalculation={{
          subtotal: 25,
          discounts: [],
          taxes: 0,
          total: 25,
          breakdown: [
            {
              dogId: 'dog-1',
              dogName: 'Ace',
              subtotal: 25,
              classes: [{ classId: 'open', className: 'Open', fee: 25 }],
            },
          ],
        }}
      />
    );

    expect(screen.getAllByText('Checking availability')).toHaveLength(2);
    expect(screen.queryByText('$25.00')).not.toBeInTheDocument();
  });
});
