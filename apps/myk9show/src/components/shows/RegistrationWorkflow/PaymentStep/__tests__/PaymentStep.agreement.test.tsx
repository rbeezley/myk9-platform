import React from 'react';
import { render, screen } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaymentStep } from '../index';
import { useShowStore } from '@/store/showStore';

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
        organization: 'AKC',
        acceptCheckPayments: true,
        acceptCashPayments: true,
      },
    ],
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
  });

  it('renders the EntryAgreementSection', () => {
    render(<PaymentStep {...baseProps} />);
    expect(screen.getByText('AKC Entry Agreement')).toBeInTheDocument();
  });

  it('renders the agreement checkbox', () => {
    render(<PaymentStep {...baseProps} />);
    expect(
      screen.getByLabelText(/I have read and agree to the AKC entry agreement/)
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
});
