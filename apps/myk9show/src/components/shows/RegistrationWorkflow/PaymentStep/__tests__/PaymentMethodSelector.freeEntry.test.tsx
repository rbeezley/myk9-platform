import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { PaymentMethodSelector } from '../PaymentMethodSelector';

/**
 * MYK9-1875: "Free entry" is offered only to this show's officials (the server accepts
 * `waived` only from them). The permission alone is not enough; the caller passes
 * `allowFreeEntry` from the show-scoped check, and the default hides the option.
 */
vi.mock('@/components/auth/PermissionGuard', () => ({
  PermissionGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const baseProps = {
  paymentMethod: '' as const,
  onPaymentMethodChange: vi.fn(),
  acceptedMethods: { check: true, cash: true },
};

describe('PaymentMethodSelector Free entry (MYK9-1875)', () => {
  it('is hidden unless the caller allows it', () => {
    render(<PaymentMethodSelector {...baseProps} />);
    expect(screen.queryByText('Free entry')).not.toBeInTheDocument();
  });

  it('is offered when the caller allows it', () => {
    render(<PaymentMethodSelector {...baseProps} allowFreeEntry />);
    expect(screen.getByText('Free entry')).toBeInTheDocument();
  });
});
