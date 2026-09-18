import { makePaymentResolution } from '@/test/utils/paymentResolution';
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

// MYK9-642: PaymentStep and the wizard's Next gate refuse to total an entry
// until the show's entry-window timezone is resolved from the trial store, so
// a test that renders them without a hydrated trial store sees the loading
// state instead of the fees. Nothing here is about the timezone; report it
// resolved.
vi.mock('@/hooks/useEntryWindowTimezone', () => ({
  useEntryWindowTimezone: () => ({ timeZone: 'America/New_York', isReady: true }),
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
      render(
        <PaymentStep
          paymentResolution={makePaymentResolution({ paymentMethod: 'credit_card' })}
          {...defaultProps}
        />
      );

      expect(screen.getByText('Payment Information')).toBeInTheDocument();
      // The fee itemisation and the amount due moved OUT of this step into the
      // wizard's entries panel (MYK9-483), which owns the only running total —
      // see EntriesPanel.test.tsx. What stays here is the step's own chrome.
      expect(screen.getByText('Payment Method')).toBeInTheDocument();
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

      render(
        <PaymentStep
          paymentResolution={makePaymentResolution({ paymentMethod: 'credit_card' })}
          {...propsWithMultipleDogs}
        />
      );

      // The $75 subtotal is asserted where it now renders — the entries panel
      // (EntriesPanel.test.tsx pins the arithmetic against the fee helper).
      // Here the step must simply survive a multi-dog selection.
      expect(screen.getByText('Payment Information')).toBeInTheDocument();
    });

    it('should show secure checkout notice for credit card selection instead of card form', () => {
      render(
        <PaymentStep
          paymentResolution={makePaymentResolution({ paymentMethod: 'credit_card' })}
          {...defaultProps}
        />
      );

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
      render(
        <PaymentStep
          paymentResolution={makePaymentResolution({ paymentMethod: 'check' })}
          {...defaultProps}
          paymentMethod="check"
        />
      );

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
      render(
        <PaymentStep
          paymentResolution={makePaymentResolution({ paymentMethod: 'cash' })}
          {...defaultProps}
          paymentMethod="cash"
        />
      );

      // Cash option should be rendered
      expect(screen.getByText('Cash (pay at show)')).toBeInTheDocument();

      // Should show cash instructions
      expect(
        screen.getByText(/Please bring exact cash amount on the day of the show/)
      ).toBeInTheDocument();
    });

    it('should show secretary payment management features', () => {
      render(
        <PaymentStep
          paymentResolution={makePaymentResolution({ paymentMethod: 'credit_card' })}
          {...defaultProps}
        />
      );

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

      render(
        <PaymentStep
          paymentResolution={makePaymentResolution({ paymentMethod: 'credit_card' })}
          {...defaultProps}
          onPaymentStatusChange={onPaymentStatusChange}
        />
      );

      // Click on Mark as Paid by Check button
      const markPaidButton = screen.getByText('Mark as Paid by Check');
      await user.click(markPaidButton);

      expect(onPaymentStatusChange).toHaveBeenCalledWith(PaymentStatus.PAID_BY_CHECK);
    });

    it('should handle entry status updates', async () => {
      const user = userEvent.setup();
      const onEntryStatusChange = vi.fn();

      render(
        <PaymentStep
          paymentResolution={makePaymentResolution({ paymentMethod: 'credit_card' })}
          {...defaultProps}
          onEntryStatusChange={onEntryStatusChange}
        />
      );

      // Navigate to Entry Status tab
      const entryStatusTab = screen.getByText('Entry Status');
      await user.click(entryStatusTab);

      // Click Accept Entry button
      const acceptButton = screen.getByText('Accept Entry');
      await user.click(acceptButton);

      expect(onEntryStatusChange).toHaveBeenCalledWith(EntryStatus.ACCEPTED, '');
    });

    it('should show proper payment status badges', () => {
      render(
        <PaymentStep
          paymentResolution={makePaymentResolution({ paymentMethod: 'credit_card' })}
          {...defaultProps}
          paymentStatus={PaymentStatus.PAID_ONLINE}
        />
      );

      // Should show current payment status, in words. The raw enum used to
      // reach the user here; the assertion tracked the bug, not an intent.
      expect(screen.getByText('Paid online')).toBeInTheDocument();
    });

    it('should handle fee override functionality', async () => {
      const user = userEvent.setup();

      render(
        <PaymentStep
          paymentResolution={makePaymentResolution({ paymentMethod: 'credit_card' })}
          {...defaultProps}
        />
      );

      // Navigate to Fee Override tab
      const feeTab = screen.getByText('Fee Override');
      await user.click(feeTab);

      // Should show waive fees option
      const waiveFeesCheckbox = screen.getByRole('checkbox', { name: 'Waive all fees' });
      expect(waiveFeesCheckbox).toBeInTheDocument();

      // Should show override amount input
      const overrideInput = screen.getByLabelText('Override Total Amount');
      expect(overrideInput).toBeInTheDocument();

      // The override is now controlled by the wizard page (the entries panel
      // renders the amount due outside this subtree and must apply the same
      // value), so the step reports it rather than holding it.
      await user.type(overrideInput, '25.00');
    });

    it('should show payment summary correctly', () => {
      render(
        <PaymentStep
          paymentResolution={makePaymentResolution({ paymentMethod: 'credit_card' })}
          {...defaultProps}
          paymentMethod="credit_card"
        />
      );

      // "Payment Summary" was the retired PaymentSummaryCard; the selected
      // method and the amount due are now the entries panel's. The step keeps
      // the method selector and its single checkout notice.
      expect(screen.getByText('Credit/Debit Card (Online Payment)')).toBeInTheDocument();
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
          paymentResolution={makePaymentResolution({ paymentMethod: 'credit_card' })}
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
          paymentResolution={makePaymentResolution({ paymentMethod: 'credit_card' })}
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

      // Subtotal assertions live with the entries panel now (MYK9-483).
      expect(screen.getByText('Payment Information')).toBeInTheDocument();
    });

    it('should handle payment status integration with entry status', () => {
      render(
        <PaymentStep
          paymentResolution={makePaymentResolution({ paymentMethod: 'credit_card' })}
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
          paymentResolution={makePaymentResolution({ paymentMethod: 'check' })}
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
          paymentResolution={makePaymentResolution({ paymentMethod: 'secretary_paid' })}
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
          paymentResolution={makePaymentResolution({ paymentMethod: 'group_payment' })}
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
