/**
 * MYK9-2149 (owner decision: inform only): when a confirmed read says the exhibitor's form
 * already holds money, the desk's payment step says so and offers ONE more choice, "Use the
 * money already on this form (take nothing now)". The secretary picks it herself: nothing is
 * preselected, and no later read changes what she chose. Every other choice is unchanged.
 */
import React from 'react';
import { render, screen } from '@/test/utils/testUtils';
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

function step(
  formHeldCents: number | null,
  paymentMethod: PaymentMethod | '' = '',
  details: PaymentDetails = {}
) {
  return (
    <PaymentStep
      staffWorkflow
      formHeldCents={formHeldCents}
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

const BANNER =
  "This form already holds $40.00. To use it, choose 'Use the money already on this form'. Record anything still owed on the entry form after submitting.";
const USE_FORM_MONEY = /^Use the money already on this form \(take nothing now\)/;
const CHOICES = [
  /^Check received/,
  /^Cash received/,
  /^Paid by a club or group/,
  /^Check \(pay at show\)/,
  /^Cash \(pay at show\)/,
  /^Free entry/,
];

describe('the money already on the form (MYK9-2149, inform only)', () => {
  beforeEach(() => {
    onPaymentMethodChange.mockClear();
    onPaymentDetailsChange.mockClear();
  });

  it('on a confirmed read, says so and offers the choice, preselecting nothing', () => {
    render(step(4000));

    expect(screen.getByText(BANNER)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: USE_FORM_MONEY })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    for (const name of CHOICES) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(onPaymentMethodChange).not.toHaveBeenCalled();
    expect(onPaymentDetailsChange).not.toHaveBeenCalled();
  });

  it('choosing it takes nothing: no cash or check is named', async () => {
    const { user } = render(step(4000));

    await user.click(screen.getByRole('button', { name: USE_FORM_MONEY }));

    // Its own method, never money received.
    expect(onPaymentMethodChange).toHaveBeenLastCalledWith('form_money');
    expect(onPaymentMethodChange).not.toHaveBeenCalledWith('secretary_paid');
  });

  it('a later read does not change, clear or hide what she chose', () => {
    const { rerender } = render(step(4000, 'form_money'));

    rerender(step(null, 'form_money'));

    expect(screen.queryByText(BANNER)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: USE_FORM_MONEY })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(onPaymentMethodChange).not.toHaveBeenCalled();
    expect(onPaymentDetailsChange).not.toHaveBeenCalled();
  });

  it('cash received still works as always beside it, and drops the form-money choice', async () => {
    const { user } = render(step(4000, 'form_money'));

    await user.click(screen.getByRole('button', { name: /^Cash received/ }));

    expect(onPaymentDetailsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ receivedMethod: 'cash' })
    );
    expect(onPaymentMethodChange).toHaveBeenLastCalledWith('secretary_paid');
  });

  it('no banner and no extra choice when nothing was confirmed', () => {
    render(step(null));

    expect(screen.queryByText(/already holds/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: USE_FORM_MONEY })).not.toBeInTheDocument();
    for (const name of CHOICES) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });
});
