import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { PaymentStep } from '@/components/shows/RegistrationWorkflow/PaymentStep';
import { PaymentStatus, EntryStatus } from '@/types/show-registration-types';

// Mock the hooks and stores
vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: () => ({
    dogs: [
      {
        id: '1',
        callName: 'Buddy',
        name: 'Champion Buddy',
        breed: 'Golden Retriever',
      },
      {
        id: '2',
        callName: 'Max',
        name: 'Champion Max',
        breed: 'German Shepherd',
      },
    ],
    isLoading: false,
    error: null,
  }),
}));

vi.mock('@/hooks/useClassStoreCompat', () => ({
  useClassStoreCompat: () => ({
    classes: [
      {
        id: 'class1',
        className: 'Novice Standard',
        entryFee: 35,
      },
      {
        id: 'class2',
        className: 'Open Standard',
        entryFee: 40,
      },
    ],
  }),
}));

vi.mock('@/store/showStore', () => ({
  useShowStore: () => ({
    shows: [],
  }),
}));

vi.mock('@/features/payments/useClubStripeAccount', () => ({
  useClubStripePaymentReadiness: () => ({
    data: true,
    isPending: false,
    isFetching: false,
    isError: false,
    isSuccess: true,
  }),
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

describe('Phase 3.5: Payment Component Tests', () => {
  describe('PaymentStep Component', () => {
    const defaultProps = {
      selectedDogs: ['1'],
      classSelections: [
        {
          dogId: '1',
          trialId: 'trial1',
          selectedClasses: [{ classId: 'class1' }],
        },
      ],
      paymentMethod: 'credit_card' as const,
      paymentStatus: PaymentStatus.PENDING,
      entryStatus: EntryStatus.PENDING,
      onPaymentMethodChange: vi.fn(),
      onPaymentStatusChange: vi.fn(),
      onEntryStatusChange: vi.fn(),
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should render payment step with fee calculation', () => {
      render(<PaymentStep {...defaultProps} />);

      expect(screen.getByText('Payment Information')).toBeInTheDocument();
      expect(screen.getByText('Registration Summary')).toBeInTheDocument();
      expect(screen.getByText('Buddy')).toBeInTheDocument();
      expect(screen.getByText('Novice Standard')).toBeInTheDocument();
      // Use getAllByText for price that appears multiple times (class fee + subtotal)
      const priceElements = screen.getAllByText('$35.00');
      expect(priceElements.length).toBeGreaterThan(0);
      expect(priceElements[0]).toBeInTheDocument();
    });

    it('should calculate fees correctly for multiple dogs', () => {
      const propsWithMultipleDogs = {
        ...defaultProps,
        selectedDogs: ['1', '2'],
        classSelections: [
          {
            dogId: '1',
            trialId: 'trial1',
            selectedClasses: [{ classId: 'class1' }],
          },
          {
            dogId: '2',
            trialId: 'trial1',
            selectedClasses: [{ classId: 'class2' }],
          },
        ],
      };

      render(<PaymentStep {...propsWithMultipleDogs} />);

      // Should show subtotal ($35 + $40 = $75)
      const subtotalElements = screen.getAllByText('$75.00');
      expect(subtotalElements.length).toBeGreaterThan(0);

      // Should show total due
      expect(screen.getByText('Entry fee total')).toBeInTheDocument();
    });

    it('should show secure checkout notice for credit card selection instead of card form', () => {
      render(<PaymentStep {...defaultProps} />);

      // Credit card option should be rendered and selected
      expect(screen.getByText('Credit/Debit Card (Online Payment)')).toBeInTheDocument();

      // The reassurance appears once, beside the card control it describes.
      const notices = screen.getAllByText(/secure checkout to complete payment/);
      expect(notices).toHaveLength(1);

      // Should NOT show card form fields (they were removed as a trust/security fix)
      expect(screen.queryByLabelText('Cardholder name')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Card number')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Expiry date')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('CVV')).not.toBeInTheDocument();
    });

    it('should handle check payment method selection', () => {
      render(<PaymentStep {...defaultProps} paymentMethod="check" />);

      // Check option should be rendered
      expect(screen.getByText('Check (pay at show)')).toBeInTheDocument();

      // Should show check instructions
      expect(
        screen.getByText(/Please bring your check made payable to the hosting club/)
      ).toBeInTheDocument();

      // Should show optional check number field
      expect(screen.getByLabelText('Check Number (optional)')).toBeInTheDocument();
    });

    it('should handle cash payment method selection', () => {
      render(<PaymentStep {...defaultProps} paymentMethod="cash" />);

      // Cash option should be rendered
      expect(screen.getByText('Cash (pay at show)')).toBeInTheDocument();

      // Should show cash instructions
      expect(
        screen.getByText(/Please bring exact cash amount on the day of the show/)
      ).toBeInTheDocument();
    });

    it('should show secretary payment management features', () => {
      render(<PaymentStep {...defaultProps} />);

      // Should show secretary management section
      expect(screen.getByText('Secretary Payment Management')).toBeInTheDocument();

      // Should show tabs
      expect(screen.getByText('Payment')).toBeInTheDocument();
      expect(screen.getByText('Entry Status')).toBeInTheDocument();
      expect(screen.getByText('Fee Override')).toBeInTheDocument();
      expect(screen.getByText('Reconciliation')).toBeInTheDocument();
    });

    it('should handle payment status updates', async () => {
      const user = userEvent.setup();
      const onPaymentStatusChange = vi.fn();

      render(<PaymentStep {...defaultProps} onPaymentStatusChange={onPaymentStatusChange} />);

      // Click on Mark as Paid by Check button
      const markPaidButton = screen.getByText('Mark as Paid by Check');
      await user.click(markPaidButton);

      expect(onPaymentStatusChange).toHaveBeenCalledWith(PaymentStatus.PAID_BY_CHECK);
    });

    it('should handle entry status updates', async () => {
      const user = userEvent.setup();
      const onEntryStatusChange = vi.fn();

      render(<PaymentStep {...defaultProps} onEntryStatusChange={onEntryStatusChange} />);

      // Navigate to Entry Status tab
      const entryStatusTab = screen.getByText('Entry Status');
      await user.click(entryStatusTab);

      // Click Accept Entry button
      const acceptButton = screen.getByText('Accept Entry');
      await user.click(acceptButton);

      expect(onEntryStatusChange).toHaveBeenCalledWith(EntryStatus.ACCEPTED, '');
    });

    it('should show proper payment status badges', () => {
      render(<PaymentStep {...defaultProps} paymentStatus={PaymentStatus.PAID_ONLINE} />);

      // Should show current payment status, in words. The raw enum used to
      // reach the user here; the assertion tracked the bug, not an intent.
      expect(screen.getByText('Paid online')).toBeInTheDocument();
    });

    it('should handle fee override functionality', async () => {
      const user = userEvent.setup();

      render(<PaymentStep {...defaultProps} />);

      // Navigate to Fee Override tab
      const feeTab = screen.getByText('Fee Override');
      await user.click(feeTab);

      // Should show waive fees option
      const waiveFeesCheckbox = screen.getByRole('checkbox', { name: 'Waive all fees' });
      expect(waiveFeesCheckbox).toBeInTheDocument();

      // Should show override amount input
      const overrideInput = screen.getByLabelText('Override Total Amount');
      expect(overrideInput).toBeInTheDocument();

      // Test fee override
      await user.type(overrideInput, '25.00');
      expect(overrideInput).toHaveValue(25);
    });

    it('should show payment summary correctly', () => {
      render(<PaymentStep {...defaultProps} paymentMethod="credit_card" />);

      expect(screen.getByText('Payment Summary')).toBeInTheDocument();
      expect(screen.getByText('Credit/Debit Card')).toBeInTheDocument();
      const notices = screen.getAllByText(/secure checkout to complete payment/);
      expect(notices).toHaveLength(1);
    });
  });

  describe('Payment Component Integration', () => {
    it('should handle payment method changes correctly', async () => {
      const user = userEvent.setup();
      const onPaymentMethodChange = vi.fn();

      render(
        <PaymentStep
          selectedDogs={['1']}
          classSelections={[
            {
              dogId: '1',
              trialId: 'trial1',
              selectedClasses: [{ classId: 'class1' }],
            },
          ]}
          paymentMethod="credit_card"
          onPaymentMethodChange={onPaymentMethodChange}
        />
      );

      // Switch to check payment by clicking the check option card
      const checkOption = screen.getByText('Check (pay at show)');
      await user.click(checkOption);

      expect(onPaymentMethodChange).toHaveBeenCalledWith('check');
    });

    it('should calculate multi-dog fees correctly', () => {
      render(
        <PaymentStep
          selectedDogs={['1', '2']}
          classSelections={[
            {
              dogId: '1',
              trialId: 'trial1',
              selectedClasses: [{ classId: 'class1' }],
            },
            {
              dogId: '2',
              trialId: 'trial1',
              selectedClasses: [{ classId: 'class2' }],
            },
          ]}
          paymentMethod="credit_card"
          onPaymentMethodChange={vi.fn()}
        />
      );

      // Should show subtotal ($35 + $40 = $75)
      expect(screen.getAllByText('$75.00').length).toBeGreaterThan(0);
      expect(screen.getByText('Entry fee total')).toBeInTheDocument();
    });

    it('should handle payment status integration with entry status', () => {
      render(
        <PaymentStep
          selectedDogs={['1']}
          classSelections={[
            {
              dogId: '1',
              trialId: 'trial1',
              selectedClasses: [{ classId: 'class1' }],
            },
          ]}
          paymentMethod="credit_card"
          paymentStatus={PaymentStatus.PAID_ONLINE}
          entryStatus={EntryStatus.ACCEPTED}
          onPaymentMethodChange={vi.fn()}
        />
      );

      // Should show both payment and entry status
      expect(screen.getByText('Paid online')).toBeInTheDocument();
    });

    it('should fire onPaymentDetailsChange when check number is entered', async () => {
      const user = userEvent.setup();
      const onPaymentDetailsChange = vi.fn();

      render(
        <PaymentStep
          selectedDogs={['1']}
          classSelections={[
            { dogId: '1', trialId: 'trial1', selectedClasses: [{ classId: 'class1' }] },
          ]}
          paymentMethod="check"
          onPaymentMethodChange={vi.fn()}
          onPaymentDetailsChange={onPaymentDetailsChange}
        />
      );

      const checkNumberInput = screen.getByLabelText('Check Number (optional)');
      await user.type(checkNumberInput, '5678');

      // Each keystroke fires the callback; the last call should contain the full value
      const calls = onPaymentDetailsChange.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const lastCall = calls[calls.length - 1][0];
      expect(lastCall).toMatchObject({ checkNumber: '5678' });
    });

    it('should fire onPaymentDetailsChange with date and reference for secretary_paid', async () => {
      const user = userEvent.setup();
      const onPaymentDetailsChange = vi.fn();

      render(
        <PaymentStep
          selectedDogs={['1']}
          classSelections={[
            { dogId: '1', trialId: 'trial1', selectedClasses: [{ classId: 'class1' }] },
          ]}
          paymentMethod="secretary_paid"
          onPaymentMethodChange={vi.fn()}
          onPaymentDetailsChange={onPaymentDetailsChange}
        />
      );

      const referenceInput = screen.getByLabelText('Reference/Receipt #');
      await user.type(referenceInput, 'REC-99');

      const calls = onPaymentDetailsChange.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const lastCall = calls[calls.length - 1][0];
      expect(lastCall).toMatchObject({ paymentReference: 'REC-99' });
    });

    it('should fire onPaymentDetailsChange with reference for group_payment', async () => {
      const user = userEvent.setup();
      const onPaymentDetailsChange = vi.fn();

      render(
        <PaymentStep
          selectedDogs={['1']}
          classSelections={[
            { dogId: '1', trialId: 'trial1', selectedClasses: [{ classId: 'class1' }] },
          ]}
          paymentMethod="group_payment"
          onPaymentMethodChange={vi.fn()}
          onPaymentDetailsChange={onPaymentDetailsChange}
        />
      );

      const groupRefInput = screen.getByLabelText('Group/Organization Reference');
      await user.type(groupRefInput, 'CLUB-42');

      const calls = onPaymentDetailsChange.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const lastCall = calls[calls.length - 1][0];
      expect(lastCall).toMatchObject({ groupReference: 'CLUB-42' });
    });
  });
});
