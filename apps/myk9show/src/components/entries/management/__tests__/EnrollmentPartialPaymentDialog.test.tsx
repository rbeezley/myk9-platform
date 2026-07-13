import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { EnrollmentPartialPaymentDialog } from '../EnrollmentPartialPaymentDialog';
import { EMPTY_PARTIAL_DIALOG, type PartialDialog } from '../enrollmentPayment';

function makeState(overrides: Partial<PartialDialog> = {}): PartialDialog {
  return { ...EMPTY_PARTIAL_DIALOG, open: true, ...overrides };
}

const baseProps = {
  onChange: vi.fn(),
  totalDollars: 50,
  paidDollars: 0,
  onClose: vi.fn(),
  onConfirm: vi.fn(),
};

describe('EnrollmentPartialPaymentDialog', () => {
  it('shows the "covers full balance" hint when the amount meets the total', () => {
    render(
      <EnrollmentPartialPaymentDialog {...baseProps} state={makeState({ amountPaid: '50' })} />
    );
    expect(screen.getByText('✓ Covers full balance — will mark as paid')).toBeTruthy();
  });

  it('shows the remaining balance when the amount is below the total', () => {
    render(
      <EnrollmentPartialPaymentDialog {...baseProps} state={makeState({ amountPaid: '20' })} />
    );
    expect(screen.getByText('Remaining after payment: $30.00')).toBeTruthy();
  });

  it('renders no hint until a valid amount is entered', () => {
    render(<EnrollmentPartialPaymentDialog {...baseProps} state={makeState()} />);
    expect(screen.queryByText(/Covers full balance/)).toBeNull();
    expect(screen.queryByText(/Remaining after payment/)).toBeNull();
    expect(
      screen.getByText('Enter a payment amount greater than $0 to record this payment.')
    ).toBeInTheDocument();
  });

  it('disables Record Payment until a positive amount is entered', () => {
    const { rerender } = render(
      <EnrollmentPartialPaymentDialog {...baseProps} state={makeState()} />
    );
    expect(screen.getByText('Record Payment').closest('button')?.disabled).toBe(true);

    rerender(
      <EnrollmentPartialPaymentDialog {...baseProps} state={makeState({ amountPaid: '10' })} />
    );
    expect(screen.getByText('Record Payment').closest('button')?.disabled).toBe(false);
  });

  it('reveals the check-number field only when the check method is active', () => {
    const { rerender } = render(
      <EnrollmentPartialPaymentDialog {...baseProps} state={makeState({ method: 'cash' })} />
    );
    expect(screen.queryByPlaceholderText('Check number (optional)')).toBeNull();

    rerender(
      <EnrollmentPartialPaymentDialog {...baseProps} state={makeState({ method: 'check' })} />
    );
    expect(screen.getByPlaceholderText('Check number (optional)')).toBeTruthy();
  });

  it('fires onConfirm from the Record Payment button', () => {
    const onConfirm = vi.fn();
    render(
      <EnrollmentPartialPaymentDialog
        {...baseProps}
        onConfirm={onConfirm}
        state={makeState({ amountPaid: '25' })}
      />
    );
    fireEvent.click(screen.getByText('Record Payment'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
