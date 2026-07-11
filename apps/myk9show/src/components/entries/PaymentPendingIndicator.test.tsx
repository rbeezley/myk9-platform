import { describe, expect, it } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { PaymentPendingIndicator, type PaymentStatus } from './PaymentPendingIndicator';

describe('PaymentPendingIndicator', () => {
  it('renders a known status label', () => {
    const { getByText } = render(<PaymentPendingIndicator status="pending" />);
    expect(getByText('Payment Pending')).toBeInTheDocument();
  });

  it('renders a fallback instead of crashing on an unknown status', () => {
    // Simulates the DB payment enum gaining a value ahead of the frontend — the
    // unguarded statusConfig[status].icon lookup would throw and blank the UI.
    // A throwing render fails this test, so a successful getByText proves both
    // that it did not crash and that the fallback label rendered.
    const unknown = 'disputed' as PaymentStatus;
    const { getByText } = render(<PaymentPendingIndicator status={unknown} />);
    expect(getByText('Payment Status')).toBeInTheDocument();
  });
});
