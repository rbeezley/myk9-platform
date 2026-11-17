/**
 * MYK9-2149 (owner decision: collect after submit): when the exhibitor's form already holds
 * money, the desk step takes no cash or check. It says what the form holds, submits with no
 * payment, and Free entry stays available both ways. Unknown money keeps the normal step.
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
vi.mock('@/components/auth/PermissionGuard', () => ({
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

const received = /^(Cash|Check) received/;

describe('the desk step when the form already holds money (MYK9-2149)', () => {
  beforeEach(() => {
    onPaymentMethodChange.mockClear();
    onPaymentDetailsChange.mockClear();
  });

  it('says what the form holds, offers no cash or check, and submits with no payment', () => {
    render(step(4000));

    expect(
      screen.getByRole('button', { name: /This form already holds \$40\.00\./ })
    ).toHaveTextContent("Submit first. We'll show what is still owed, if anything.");
    expect(screen.queryByRole('button', { name: received })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /pay at show/ })).not.toBeInTheDocument();
    expect(onPaymentDetailsChange).toHaveBeenCalledWith(
      expect.objectContaining({ formHoldsMoney: true, receivedMethod: undefined })
    );
    expect(onPaymentMethodChange).toHaveBeenCalledWith('secretary_paid');
  });

  it("keeps today's normal step while the money is unknown (loading or failed)", () => {
    render(step(null));

    expect(screen.queryByText(/already holds/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Cash received/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Check \(pay at show\)/ })).toBeInTheDocument();
    expect(onPaymentMethodChange).not.toHaveBeenCalled();
    expect(onPaymentDetailsChange).not.toHaveBeenCalled();
  });

  it('lets the secretary make it a Free entry and change her mind', async () => {
    const { user, rerender } = render(step(4000, 'secretary_paid', { formHoldsMoney: true }));
    onPaymentMethodChange.mockClear();

    await user.click(screen.getByRole('button', { name: /^Free entry/ }));
    expect(onPaymentMethodChange).toHaveBeenLastCalledWith('waived');
    expect(onPaymentDetailsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ formHoldsMoney: false })
    );

    rerender(step(4000, 'waived'));
    // Not taken back by the form's money while it is a Free entry.
    expect(onPaymentMethodChange).toHaveBeenLastCalledWith('waived');

    await user.click(screen.getByRole('button', { name: /This form already holds/ }));
    expect(onPaymentMethodChange).toHaveBeenLastCalledWith('secretary_paid');
    expect(onPaymentDetailsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ formHoldsMoney: true })
    );
  });

  it('drops the form choice when the form is no longer read as holding money', () => {
    const { rerender } = render(step(4000, 'secretary_paid', { formHoldsMoney: true }));
    onPaymentDetailsChange.mockClear();

    rerender(step(null, 'secretary_paid', { formHoldsMoney: true }));

    expect(onPaymentDetailsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ formHoldsMoney: false })
    );
    expect(screen.getByText('Choose whether a check or cash came with this entry.')).toBeVisible();
  });
});
