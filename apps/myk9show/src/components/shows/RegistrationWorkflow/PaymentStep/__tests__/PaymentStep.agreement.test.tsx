import React from 'react';
import { cleanup, render, screen } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaymentStep } from '../index';
import { useShowStore } from '@/store/showStore';
import { useClubStripePaymentReadiness } from '@/features/payments/useClubStripeAccount';

// Mock hooks used by PaymentStep
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
    // "Answered for this organization" — the component requires both, because a
    // paused query and another show's placeholder row both otherwise look
    // resolved.
    isFetching: false,
    isSuccess: true,
    isPlaceholderData: false,
    refetch: vi.fn(),
  }),
}));

const baseProps = {
  selectedDogs: [],
  classSelections: [],
  paymentMethod: '' as const,
  onPaymentMethodChange: vi.fn(),
  showId: 'show-1',
};

describe('PaymentStep — entry agreement integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useClubStripePaymentReadiness).mockReturnValue({
      data: true,
      isPending: false,
      isFetching: false,
      isError: false,
      isSuccess: true,
    } as ReturnType<typeof useClubStripePaymentReadiness>);
    vi.mocked(useShowStore).mockReturnValue({
      shows: [
        {
          id: 'show-1',
          clubId: 'club-1',
          organization: 'AKC',
          acceptCheckPayments: true,
          acceptCashPayments: true,
        },
      ],
    } as ReturnType<typeof useShowStore>);
  });

  it('renders the EntryAgreementSection', () => {
    render(<PaymentStep {...baseProps} />);
    expect(screen.getByText('AKC Entry Agreement')).toBeInTheDocument();
  });

  it('renders the agreement checkbox', () => {
    render(<PaymentStep {...baseProps} />);
    expect(
      screen.getByRole('checkbox', {
        name: /I have read and agree to the AKC entry agreement/,
      })
    ).toBeInTheDocument();
  });

  it('agreement checkbox is unchecked by default', () => {
    render(<PaymentStep {...baseProps} />);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();
  });

  it('agreement checkbox can be toggled', async () => {
    const user = userEvent.setup();
    render(<PaymentStep {...baseProps} />);

    const checkbox = screen.getByRole('checkbox');
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  // Controlled mode: onAgreementChange callback is called
  it('calls onAgreementChange when checkbox toggled (controlled mode)', async () => {
    const user = userEvent.setup();
    const onAgreementChange = vi.fn();
    render(
      <PaymentStep
        {...baseProps}
        agreedToEntryAgreement={false}
        onAgreementChange={onAgreementChange}
      />
    );

    await user.click(screen.getByRole('checkbox'));
    expect(onAgreementChange).toHaveBeenCalledWith(true);
  });

  it('does not render agreement section when show has no organization', () => {
    vi.mocked(useShowStore).mockReturnValueOnce({
      shows: [
        {
          id: 'show-no-org',
          acceptCheckPayments: true,
          acceptCashPayments: true,
        },
      ],
    } as ReturnType<typeof useShowStore>);

    render(<PaymentStep {...baseProps} showId="show-no-org" />);
    expect(screen.queryByText(/Entry Agreement/)).not.toBeInTheDocument();
  });

  it('offers card payment only when the hosting club has a usable Stripe account', () => {
    render(<PaymentStep {...baseProps} />);
    expect(screen.getByText('Credit/Debit Card (Online Payment)')).toBeInTheDocument();

    vi.mocked(useClubStripePaymentReadiness).mockReturnValue({
      data: false,
      isPending: false,
      isFetching: false,
      isError: false,
      isSuccess: true,
    } as ReturnType<typeof useClubStripePaymentReadiness>);
    vi.mocked(useShowStore).mockReturnValue({
      shows: [
        {
          id: 'show-no-stripe',
          clubId: 'club-without-stripe',
          organization: 'AKC',
          acceptCheckPayments: true,
          acceptCashPayments: true,
        },
      ],
    } as ReturnType<typeof useShowStore>);

    cleanup();
    render(<PaymentStep {...baseProps} showId="show-no-stripe" />);
    expect(screen.queryByText('Credit/Debit Card (Online Payment)')).not.toBeInTheDocument();
    expect(
      screen.getByText(/Online card payment isn't available for this club/)
    ).toBeInTheDocument();
    expect(screen.getByText('Check (pay at show)')).toBeInTheDocument();
    expect(screen.getByText('Cash (pay at show)')).toBeInTheDocument();
  });
});
