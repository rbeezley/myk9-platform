import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { EnrollmentRefundDialog } from '../EnrollmentRefundDialog';
import { EMPTY_REFUND_DIALOG, type RefundDialog } from '../enrollmentPayment';

function makeState(overrides: Partial<RefundDialog> = {}): RefundDialog {
  return { ...EMPTY_REFUND_DIALOG, open: true, ...overrides };
}

const baseProps = {
  onChange: vi.fn(),
  refundableDollars: 50,
  onClose: vi.fn(),
  onConfirm: vi.fn(),
};

describe('EnrollmentRefundDialog', () => {
  it('explains why Record Refund is disabled until a positive amount is entered', () => {
    render(<EnrollmentRefundDialog {...baseProps} state={makeState()} />);

    expect(screen.getByRole('button', { name: 'Record Refund' })).toBeDisabled();
    expect(
      screen.getByText('Enter a refund amount greater than $0 to record this refund.')
    ).toBeInTheDocument();
  });
});

/**
 * MYK9-2152: when the form's payment record has not loaded, the desk money a refund is capped by
 * is not known. The dialog quotes no figure, pre-fills nothing, and waits for the record.
 */
describe('EnrollmentRefundDialog when the amount is not available', () => {
  it('quotes no figure, says the amount is not available, and cannot be confirmed', () => {
    render(
      <EnrollmentRefundDialog {...baseProps} amountUnknown state={makeState({ amount: '50.00' })} />
    );

    expect(screen.queryByText(/\$50\.00/)).not.toBeInTheDocument();
    expect(screen.getByText('Amount not available')).toBeInTheDocument();
    expect(screen.getByTestId('refund-amount-unknown-note')).toHaveTextContent(
      'Record this refund once the form’s payment record loads.'
    );
    expect(screen.queryByText('(pre-filled from paid)')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Refund Amount/i)).toHaveValue(null);
    expect(screen.getByLabelText(/Refund Amount/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Record Refund' })).toBeDisabled();
  });

  it('quotes the desk money and allows the refund when the amount is known', () => {
    render(<EnrollmentRefundDialog {...baseProps} state={makeState({ amount: '50.00' })} />);

    expect(screen.getByText('$50.00')).toBeInTheDocument();
    expect(screen.queryByText('Amount not available')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Refund Amount/i)).toHaveValue(50);
    expect(screen.getByRole('button', { name: 'Record Refund' })).toBeEnabled();
  });
});
