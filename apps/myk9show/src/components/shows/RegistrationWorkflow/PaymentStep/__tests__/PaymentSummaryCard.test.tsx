import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { PaymentSummaryCard } from '../PaymentSummaryCard';
import type { FeeCalculationResult } from '../types';

const feeCalculation: FeeCalculationResult = {
  subtotal: 27,
  discounts: [],
  taxes: 0,
  total: 27,
  breakdown: [],
};

describe('PaymentSummaryCard', () => {
  it('explains why Next is disabled when payment is due but no method is selected', () => {
    render(
      <PaymentSummaryCard
        paymentMethod=""
        feeCalculation={feeCalculation}
        waiveFees={false}
        feeOverride={null}
      />
    );

    expect(screen.getByText('Not selected')).toBeInTheDocument();
    expect(screen.getByText(/Choose a payment method to continue/i)).toBeInTheDocument();
  });

  it('does not show the missing-method hint after a payment method is selected', () => {
    render(
      <PaymentSummaryCard
        paymentMethod="check"
        feeCalculation={feeCalculation}
        waiveFees={false}
        feeOverride={null}
      />
    );

    expect(screen.getByText('Check at Show')).toBeInTheDocument();
    expect(screen.queryByText(/Choose a payment method to continue/i)).not.toBeInTheDocument();
  });
});
