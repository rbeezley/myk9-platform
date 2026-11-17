/**
 * MYK9-2149 (owner decision: inform only): when the exhibitor's form already holds money, the
 * desk's payment step says so and nothing else. Every choice, default and the submit stay as
 * they are; anything taken is recorded in full.
 */
import React from 'react';
import { render, screen } from '@/test/utils/testUtils';
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
const onPaymentDetailsChange = vi.fn();

function renderStep(formHeldCents: number | null, paymentMethod: PaymentMethod | '' = '') {
  return render(
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
      getPaymentDetails={() => ({})}
    />
  );
}

const BANNER = 'This form already holds $40.00. Take only what is still owed.';
const CHOICES = [
  /^Check received/,
  /^Cash received/,
  /^Paid by a club or group/,
  /^Check \(pay at show\)/,
  /^Cash \(pay at show\)/,
  /^Free entry/,
];

describe('the money already on the form is said, never acted on (MYK9-2149)', () => {
  beforeEach(() => {
    onPaymentMethodChange.mockClear();
    onPaymentDetailsChange.mockClear();
  });

  it('shows the banner on a confirmed read, beside every usual choice, choosing nothing', () => {
    renderStep(4000);

    expect(screen.getByText(BANNER)).toBeInTheDocument();
    for (const name of CHOICES) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(onPaymentMethodChange).not.toHaveBeenCalled();
    expect(onPaymentDetailsChange).not.toHaveBeenCalled();
  });

  it('leaves a choice the secretary makes exactly as it would be without the banner', async () => {
    const { user } = renderStep(4000, 'secretary_paid');

    await user.click(screen.getByRole('button', { name: /^Cash received/ }));

    expect(onPaymentDetailsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ receivedMethod: 'cash' })
    );
    expect(onPaymentMethodChange).toHaveBeenLastCalledWith('secretary_paid');
    expect(screen.getByText(BANNER)).toBeInTheDocument();
  });

  it('shows no banner when nothing was confirmed (loading, failed, offline or nothing held)', () => {
    renderStep(null);

    expect(screen.queryByText(/already holds/)).not.toBeInTheDocument();
    for (const name of CHOICES) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });
});
