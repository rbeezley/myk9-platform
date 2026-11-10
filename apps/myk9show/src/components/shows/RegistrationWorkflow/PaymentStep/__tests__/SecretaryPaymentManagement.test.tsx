/**
 * MYK9-1822: the secretary's payment card on the late-entry payment step keeps
 * three things, in plain words, on one card with no tabs: change the total,
 * paid by cash or check, make it free. Paid and free are shortcuts to the SAME
 * payment-method handler the Payment Method list calls, so a late entry has one
 * way to record cash or check and one way to be free (no second, unrecorded
 * status flag).
 */
import React from 'react';
import { render, screen, within } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makePaymentResolution } from '@/test/utils/paymentResolution';
import type { PaymentMethod } from '@/types/show-registration-types';
import { PaymentStep } from '../index';

vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: () => ({ dogs: [{ id: 'dog-1', callName: 'Buddy' }] }),
}));
vi.mock('@/hooks/useClassStoreCompat', () => ({
  useClassStoreCompat: () => ({ classes: [{ id: 'class-1', className: 'Novice', entryFee: 35 }] }),
}));
vi.mock('@/hooks/useEntryWindowTimezone', () => ({
  useEntryWindowTimezone: () => ({
    timeZone: 'America/New_York',
    isReady: true,
    isUnavailable: false,
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

const onPaymentMethodChange = vi.fn();
const onFeeOverrideChange = vi.fn();

/** The wizard page owns the changed total; this holds it the way the page does. */
function Harness({ paymentMethod }: { paymentMethod: PaymentMethod | '' }) {
  const [feeOverride, setFeeOverride] = React.useState<number | null>(null);
  return (
    <PaymentStep
      paymentResolution={makePaymentResolution({ paymentMethod })}
      selectedDogs={['dog-1']}
      classSelections={[
        { dogId: 'dog-1', trialId: 'trial-1', selectedClasses: [{ classId: 'class-1' }] },
      ]}
      paymentMethod={paymentMethod}
      onPaymentMethodChange={onPaymentMethodChange}
      feeOverride={feeOverride}
      onFeeOverrideChange={value => {
        onFeeOverrideChange(value);
        setFeeOverride(value);
      }}
    />
  );
}

function renderStep(paymentMethod: PaymentMethod | '' = 'check') {
  return render(<Harness paymentMethod={paymentMethod} />);
}

const deskCard = () => screen.getByRole('region', { name: 'Payment at the desk' });

describe('SecretaryPaymentManagement (MYK9-1822)', () => {
  beforeEach(() => {
    onPaymentMethodChange.mockClear();
    onFeeOverrideChange.mockClear();
  });

  it('shows the three kept actions on one card with no tabs', () => {
    renderStep();
    const card = within(deskCard());

    expect(card.getByLabelText('Change the total')).toBeVisible();
    expect(card.getByRole('button', { name: 'Paid by cash or check' })).toBeVisible();
    expect(card.getByRole('button', { name: 'Make free' })).toBeVisible();
    expect(card.queryAllByRole('tab')).toHaveLength(0);
  });

  it('says nothing about override, reconciliation, bulk, operations or technical', () => {
    renderStep();
    expect(deskCard().textContent).not.toMatch(
      /override|reconciliation|bulk|operations|technical/i
    );
    // The removed controls are gone, not hidden behind another tab.
    expect(screen.queryByText(/Reset to Pending/i)).toBeNull();
    expect(screen.queryByText(/Add to Waitlist/i)).toBeNull();
    expect(screen.queryByText(/Reason for Status Change/i)).toBeNull();
  });

  it('"Paid by cash or check" calls the same handler as the Payment Method list', async () => {
    const user = userEvent.setup();
    renderStep();

    await user.click(within(deskCard()).getByRole('button', { name: 'Paid by cash or check' }));
    expect(onPaymentMethodChange).toHaveBeenCalledWith('secretary_paid');

    onPaymentMethodChange.mockClear();
    await user.click(screen.getByText('Secretary Payment (Already Received)'));
    expect(onPaymentMethodChange).toHaveBeenCalledWith('secretary_paid');
  });

  it('"Make free" calls the same handler as the Payment Method list', async () => {
    const user = userEvent.setup();
    renderStep();

    await user.click(within(deskCard()).getByRole('button', { name: 'Make free' }));
    expect(onPaymentMethodChange).toHaveBeenCalledWith('waived');

    onPaymentMethodChange.mockClear();
    await user.click(screen.getByText('Free entry'));
    expect(onPaymentMethodChange).toHaveBeenCalledWith('waived');
  });

  it('shows the usual total and reports a changed one', async () => {
    const user = userEvent.setup();
    renderStep();

    expect(within(deskCard()).getByText(/Leave blank to charge the usual \$35\.00/)).toBeVisible();
    await user.type(within(deskCard()).getByLabelText('Change the total'), '25');
    expect(onFeeOverrideChange).toHaveBeenLastCalledWith(25);
  });

  it('a free entry marks "Make free" pressed and hides the total', () => {
    renderStep('waived');
    const card = within(deskCard());

    expect(card.getByRole('button', { name: 'Make free' })).toHaveAttribute('aria-pressed', 'true');
    expect(card.queryByLabelText('Change the total')).toBeNull();
  });

  it('the free option no longer promises an admin approval nobody gives', () => {
    renderStep('waived');
    expect(screen.queryByText(/admin approval/i)).toBeNull();
  });
});
