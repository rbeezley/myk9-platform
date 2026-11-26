/**
 * MYK9-2020: a secretary keying in a mail-in entry sees ONE set of payment
 * choices in her words, split into paid and not paid yet, and "Check received"
 * records exactly what "Secretary Payment (Already Received)" + "Received as:
 * Check" did: the `secretary_paid` method with `receivedMethod: 'check'` and the
 * check number in the payment reference.
 */
import React from 'react';
import { render, screen, within } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makePaymentResolution } from '@/test/utils/paymentResolution';
import type { PaymentDetails, PaymentMethod } from '@/types/show-registration-types';
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
vi.mock('@/components/rbac/PermissionGuard', () => ({
  PermissionGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const onPaymentMethodChange = vi.fn();
const onPaymentDetailsChange = vi.fn();

function renderStaffStep(paymentMethod: PaymentMethod | '', details: PaymentDetails = {}) {
  return render(
    <PaymentStep
      staffWorkflow
      paymentResolution={makePaymentResolution({
        paymentMethod,
        cardCheckoutAvailable: false,
        isOnBehalf: true,
        canUseDeskPaymentActions: true,
      })}
      selectedDogs={['dog-1']}
      paymentMethod={paymentMethod}
      onPaymentMethodChange={onPaymentMethodChange}
      onPaymentDetailsChange={onPaymentDetailsChange}
      getPaymentDetails={() => details}
    />
  );
}

const choice = (name: RegExp) => screen.getByRole('button', { name });

describe("the secretary's payment choices (MYK9-2020)", () => {
  beforeEach(() => {
    onPaymentMethodChange.mockClear();
    onPaymentDetailsChange.mockClear();
  });

  it('records a posted check as money received by check', async () => {
    const { user } = renderStaffStep('secretary_paid');

    await user.click(choice(/^Check received/));

    expect(onPaymentDetailsChange).toHaveBeenCalledWith(
      expect.objectContaining({ receivedMethod: 'check' })
    );
    expect(onPaymentMethodChange).toHaveBeenLastCalledWith('secretary_paid');
  });

  it("keeps the check's number in the payment reference, as before", async () => {
    const { user } = renderStaffStep('secretary_paid', { receivedMethod: 'check' });

    expect(choice(/^Check received/)).toHaveAttribute('aria-pressed', 'true');
    await user.type(screen.getByLabelText('Check number'), '1042');

    expect(onPaymentDetailsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ receivedMethod: 'check', paymentReference: '1042' })
    );
  });

  it('records cash received as cash', async () => {
    const { user } = renderStaffStep('secretary_paid', { receivedMethod: 'check' });

    await user.click(choice(/^Cash received/));

    expect(onPaymentDetailsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ receivedMethod: 'cash' })
    );
    expect(onPaymentMethodChange).toHaveBeenLastCalledWith('secretary_paid');
  });

  it('puts the paid choices and the not-paid-yet choices in separate, labelled groups', () => {
    renderStaffStep('secretary_paid');

    const paid = screen.getByRole('group', { name: 'Paid with the entry' });
    const unpaid = screen.getByRole('group', { name: 'Not paid yet' });
    expect(within(paid).getByRole('button', { name: /^Check received/ })).toBeInTheDocument();
    expect(within(paid).getByRole('button', { name: /^Cash received/ })).toBeInTheDocument();
    // The badges (the group headings are h4s).
    expect(within(paid).getAllByText('Paid', { selector: 'div' })).toHaveLength(3);
    expect(within(unpaid).getByRole('button', { name: /^Check \(pay at show\)/ })).toBeVisible();
    expect(within(unpaid).getByRole('button', { name: /^Cash \(pay at show\)/ })).toBeVisible();
    expect(within(unpaid).getAllByText('Not paid yet', { selector: 'div' })).toHaveLength(2);
    expect(within(paid).queryByText('Not paid yet')).not.toBeInTheDocument();
  });

  it('offers one set of choices: no second desk card, no exhibitor wording', () => {
    renderStaffStep('secretary_paid');

    expect(screen.queryByRole('region', { name: 'Payment at the desk' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Secretary Payment/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Paid by cash or check/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Now choose cash or check/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Review your fees/)).not.toBeInTheDocument();
    expect(screen.queryByText(/bring your check/i)).not.toBeInTheDocument();
    // Each method appears once.
    expect(screen.getAllByRole('button', { name: /Free entry/ })).toHaveLength(1);
  });

  it('asks how the money came when "already received" has no method yet', () => {
    renderStaffStep('secretary_paid');

    expect(screen.getByRole('status')).toHaveTextContent(
      'Choose whether a check or cash came with this entry.'
    );
    expect(choice(/^Check received/)).toHaveAttribute('aria-pressed', 'false');
    expect(choice(/^Cash received/)).toHaveAttribute('aria-pressed', 'false');
  });

  it('a pay-at-show check is the plain check method, with nothing received', async () => {
    const { user } = renderStaffStep('secretary_paid');

    await user.click(choice(/^Check \(pay at show\)/));

    expect(onPaymentMethodChange).toHaveBeenLastCalledWith('check');
    expect(onPaymentDetailsChange).not.toHaveBeenCalled();
  });

  it('makes an entry free through the one Free entry choice', async () => {
    const { user } = renderStaffStep('check');

    await user.click(choice(/^Free entry/));

    expect(onPaymentMethodChange).toHaveBeenLastCalledWith('waived');
  });
});
