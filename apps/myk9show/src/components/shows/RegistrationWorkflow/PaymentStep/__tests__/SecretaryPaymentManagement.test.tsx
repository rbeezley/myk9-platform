/**
 * MYK9-1822: the secretary's payment card on the late-entry payment step keeps
 * two things, in plain words, on one card with no tabs: paid by cash or check,
 * and make it free. "Change the total" is gone: it never reached the saved
 * entry, and the owner keeps no number that is not recorded. Paid and free are shortcuts to the SAME
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

function renderStep(paymentMethod: PaymentMethod | '' = 'check') {
  return render(
    <PaymentStep
      paymentResolution={makePaymentResolution({ paymentMethod })}
      selectedDogs={['dog-1']}
      paymentMethod={paymentMethod}
      onPaymentMethodChange={onPaymentMethodChange}
    />
  );
}

const deskCard = () => screen.getByRole('region', { name: 'Payment at the desk' });

describe('SecretaryPaymentManagement (MYK9-1822)', () => {
  beforeEach(() => {
    onPaymentMethodChange.mockClear();
  });

  it('shows only the two kept actions on one card with no tabs and no total', () => {
    renderStep();
    const card = within(deskCard());

    expect(card.queryByLabelText('Change the total')).toBeNull();
    expect(card.queryByRole('spinbutton')).toBeNull();
    expect(deskCard().textContent).not.toMatch(/\$\d/);
    expect(card.getAllByRole('button')).toHaveLength(2);
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

  it('a free entry marks "Make free" pressed', () => {
    renderStep('waived');
    const card = within(deskCard());

    expect(card.getByRole('button', { name: 'Make free' })).toHaveAttribute('aria-pressed', 'true');
    expect(card.getByText('This is a free entry.')).toBeVisible();
  });

  it('the free option no longer promises an admin approval nobody gives', () => {
    renderStep('waived');
    expect(screen.queryByText(/admin approval/i)).toBeNull();
  });
});
