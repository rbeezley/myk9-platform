import React from 'react';
import { render, screen } from '@/test/utils/testUtils';
import { describe, it, expect, vi } from 'vitest';
import { PaymentStep } from '../index';
import { usePaymentMethodResolution } from '../usePaymentMethodResolution';
import type { PaymentStepProps } from '../types';

vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: () => ({ dogs: [] }),
}));
vi.mock('@/hooks/useClassStoreCompat', () => ({
  useClassStoreCompat: () => ({ classes: [] }),
}));
vi.mock('@/store/showStore', () => ({
  useShowStore: vi.fn(() => ({
    shows: [
      {
        id: 'show-1',
        clubId: 'club-1',
        organization: 'AKC',
        acceptCheckPayments: true,
        acceptCashPayments: true,
      },
    ],
  })),
}));
vi.mock('@/features/payments/useClubStripeAccount', () => ({
  useClubStripePaymentReadiness: vi.fn(() => ({
    data: true,
    isPending: false,
    isFetching: false,
    isError: false,
    isSuccess: true,
  })),
}));
vi.mock('@/hooks/useRegistrationPermissions', () => ({
  useRegistrationPermissions: () => ({}),
  REGISTRATION_PERMISSIONS: {
    MARK_PAYMENT: 'registration:mark_payment',
    MANAGE_PAYMENTS: 'registration:manage_payments',
    BULK_OPERATIONS: 'registration:bulk_operations',
  },
}));
vi.mock('@/components/auth/PermissionGuard', () => ({
  PermissionGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/hooks/queries/useOrganizationAgreement', () => ({
  useOrganizationAgreement: () => ({
    data: { organization: 'AKC', agreement_text: 'Test agreement text' },
    isLoading: false,
    isError: false,
    isFetching: false,
    isSuccess: true,
    isPlaceholderData: false,
    refetch: vi.fn(),
  }),
}));

function PaymentStepHarness(props: Omit<PaymentStepProps, 'paymentResolution'>) {
  const paymentResolution = usePaymentMethodResolution(props.showId, props.paymentMethod);
  return <PaymentStep {...props} paymentResolution={paymentResolution} />;
}

const baseProps = {
  selectedDogs: [],
  classSelections: [],
  paymentMethod: '' as const,
  onPaymentMethodChange: vi.fn(),
  showId: 'show-1',
};

// MYK9-1013: the alert makes the "free to join" promise, qualified by "just
// for joining" (a paid dog that overflowed a cart is charged and refunded).
describe('PaymentStep — wait-list is free copy (MYK9-1013)', () => {
  it('tells the exhibitor joining a wait list is free and what happens next', () => {
    render(<PaymentStepHarness {...baseProps} waitlistClassIds={new Set(['class-1'])} />);
    const alert = screen.getByText(/joining a wait list is free/i);
    expect(alert.textContent).toBe(
      'Good news: joining a wait list is free. You’re never charged just for joining, so the wait-list classes in your selection cost nothing today. If a spot opens, we’ll let you know, and you pay only if you decide to claim it.'
    );
  });

  it('does not claim "never charged" without the "just for joining" qualifier', () => {
    render(<PaymentStepHarness {...baseProps} waitlistClassIds={new Set(['class-1'])} />);
    expect(document.body.textContent).not.toMatch(/never charged(?! just for joining)/i);
  });

  it('shows nothing about wait lists when no selected class is a wait-list request', () => {
    render(<PaymentStepHarness {...baseProps} />);
    expect(screen.queryByText(/joining a wait list is free/i)).not.toBeInTheDocument();
  });
});
