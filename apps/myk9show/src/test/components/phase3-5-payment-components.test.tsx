import { makePaymentResolution } from '@/test/utils/paymentResolution';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { PaymentStep } from '@/components/shows/RegistrationWorkflow/PaymentStep';

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
// state instead of the fees. Nothing here is about the timezone, so it is
// reported resolved by default — but through a fixture that can be flipped, not
// a permanent `true`, so at least one case per suite exercises not-ready and a
// regression in the gate cannot hide behind these mocks (N-F6).
const entryWindowTimezone = vi.hoisted(() => {
  // ONE factory for every field, and the live object is seeded from it. A setter
  // that restored a hand-written subset would leak any field it forgot — and a
  // reset that lives inside one describe leaks the whole object into the next
  // one, which under `--sequence.shuffle` is a ~1/13 red on a file CI runs
  // shuffled and local runs do not (MYK9-642 P-F1, LESSON MYK9-666).
  const defaults = () => ({
    timeZone: 'America/New_York',
    isReady: true,
    isUnavailable: false,
  });
  return { defaults, current: defaults() };
});
vi.mock('@/hooks/useEntryWindowTimezone', () => ({
  useEntryWindowTimezone: () => entryWindowTimezone.current,
}));

// FILE-WIDE, outside every describe: the reset has to outlive whichever describe
// the shuffled order happens to end on.
beforeEach(() => {
  Object.assign(entryWindowTimezone.current, entryWindowTimezone.defaults());
});

function withUnresolvedShowTimezone(): void {
  entryWindowTimezone.current.isReady = false;
  entryWindowTimezone.current.isUnavailable = false;
}

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
      paymentMethod: 'credit_card' as const,
      onPaymentMethodChange: vi.fn(),
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('renders no fee calculation while the show timezone is unresolved (MYK9-642)', () => {
      // The fee tier is decided in the show's own timezone; until it resolves
      // this step must show no total rather than one from the fallback.
      withUnresolvedShowTimezone();
      render(
        <PaymentStep
          paymentResolution={makePaymentResolution({ paymentMethod: 'credit_card' })}
          {...defaultProps}
        />
      );

      expect(screen.getByText(/Loading show details before totalling this entry/i)).toBeVisible();
      // The step totals nothing itself (MYK9-1822); no dollar figure anywhere.
      expect(screen.queryByText(/\$\d/)).toBeNull();
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

    it('should show the secretary desk card without tabs (MYK9-1822)', () => {
      render(
        <PaymentStep
          paymentResolution={makePaymentResolution({ paymentMethod: 'credit_card' })}
          {...defaultProps}
        />
      );

      // One card, two plain actions and no total; SecretaryPaymentManagement.test.tsx
      // pins each one's handler.
      expect(screen.getByText('Payment at the desk')).toBeInTheDocument();
      expect(screen.queryByLabelText('Change the total')).toBeNull();
      expect(screen.getByRole('button', { name: 'Paid by cash or check' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Make free' })).toBeInTheDocument();
      expect(screen.queryAllByRole('tab')).toHaveLength(0);
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
          paymentMethod="credit_card"
          onPaymentMethodChange={vi.fn()}
        />
      );

      // Subtotal assertions live with the entries panel now (MYK9-483).
      expect(screen.getByText('Payment Information')).toBeInTheDocument();
    });

    it('should fire onPaymentDetailsChange when check number is entered', async () => {
      const user = userEvent.setup();
      const onPaymentDetailsChange = vi.fn();

      render(
        <PaymentStep
          paymentResolution={makePaymentResolution({ paymentMethod: 'check' })}
          selectedDogs={['1']}
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
