/**
 * MYK9-2149 (owner decision: collect after submit): when a read CONFIRMS the exhibitor's form
 * already holds money, the desk step takes no cash or check. It says what the form holds,
 * submits with no payment, and "Paid by a club or group" and Free entry stay available both
 * ways. While the read is checking, no money can be taken; when it fails, the step is the
 * normal one with a note, and anything taken is recorded in full.
 */
import React from 'react';
import { render, screen } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makePaymentResolution } from '@/test/utils/paymentResolution';
import type { PaymentDetails, PaymentMethod } from '@/types/show-registration-types';
import type { DeskFormMoney } from '@/features/registration/deskFormDue';
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
const holds: DeskFormMoney = { status: 'holds', heldCents: 4000 };

function step(
  formMoney: DeskFormMoney,
  paymentMethod: PaymentMethod | '' = '',
  details: PaymentDetails = {}
) {
  return (
    <PaymentStep
      staffWorkflow
      formMoney={formMoney}
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

describe('the desk step and the money already on the form (MYK9-2149)', () => {
  beforeEach(() => {
    onPaymentMethodChange.mockClear();
    onPaymentDetailsChange.mockClear();
  });

  it('says what the form holds, offers no cash or check, and submits with no payment', () => {
    render(step(holds));

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

  it('keeps the club or group choice beside the money on the form', async () => {
    const { user } = render(step(holds, 'secretary_paid', { formHoldsMoney: true }));

    await user.click(screen.getByRole('button', { name: /^Paid by a club or group/ }));

    expect(onPaymentMethodChange).toHaveBeenLastCalledWith('group_payment');
    expect(onPaymentDetailsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ formHoldsMoney: false })
    );
  });

  it('takes no money while the form is being checked', () => {
    render(step({ status: 'checking' }));

    expect(screen.getByText('Checking the money on this form...')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: received })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /pay at show/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Free entry/ })).toBeInTheDocument();
    expect(onPaymentMethodChange).not.toHaveBeenCalled();
  });

  it('keeps the normal step, with a note, when the check fails', () => {
    render(step({ status: 'failed' }));

    expect(screen.getByText('Could not check the money already on this form.')).toBeInTheDocument();
    expect(screen.queryByText(/already holds/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Cash received/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Check \(pay at show\)/ })).toBeInTheDocument();
    expect(onPaymentMethodChange).not.toHaveBeenCalled();
    expect(onPaymentDetailsChange).not.toHaveBeenCalled();
  });

  it('keeps the normal step, with no note, when the form holds nothing', () => {
    render(step({ status: 'none' }));

    expect(screen.queryByText(/Could not check/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Cash received/ })).toBeInTheDocument();
  });

  it('lets the secretary make it a Free entry and change her mind', async () => {
    const { user, rerender } = render(step(holds, 'secretary_paid', { formHoldsMoney: true }));
    onPaymentMethodChange.mockClear();

    await user.click(screen.getByRole('button', { name: /^Free entry/ }));
    expect(onPaymentMethodChange).toHaveBeenLastCalledWith('waived');
    expect(onPaymentDetailsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ formHoldsMoney: false })
    );

    rerender(step(holds, 'waived'));
    // Not taken back by the form's money while it is a Free entry.
    expect(onPaymentMethodChange).toHaveBeenLastCalledWith('waived');

    await user.click(screen.getByRole('button', { name: /This form already holds/ }));
    expect(onPaymentMethodChange).toHaveBeenLastCalledWith('secretary_paid');
    expect(onPaymentDetailsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ formHoldsMoney: true })
    );
  });

  it('drops the form choice when the form is no longer read as holding money', () => {
    const { rerender } = render(step(holds, 'secretary_paid', { formHoldsMoney: true }));
    onPaymentDetailsChange.mockClear();

    rerender(step({ status: 'none' }, 'secretary_paid', { formHoldsMoney: true }));

    expect(onPaymentDetailsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ formHoldsMoney: false })
    );
    expect(screen.getByText('Choose whether a check or cash came with this entry.')).toBeVisible();
  });
});
