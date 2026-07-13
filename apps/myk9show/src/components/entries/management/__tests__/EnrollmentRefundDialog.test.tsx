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
  paidDollars: 50,
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
