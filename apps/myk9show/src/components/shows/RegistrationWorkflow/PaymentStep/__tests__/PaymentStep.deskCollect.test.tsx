/**
 * MYK9-2149: the desk's payment step names what to collect for an entry added to a form
 * that already holds money: nothing when the form covers it ("Already covered"), only the
 * difference when it covers part, and the step as it always was when it holds nothing.
 */
import React from 'react';
import { render, screen } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makePaymentResolution } from '@/test/utils/paymentResolution';
import type { DeskAddOnCollect } from '@/features/registration/deskAddOnCollect';
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

function renderDeskStep(deskCollect: DeskAddOnCollect, paymentMethod: PaymentMethod | '' = '') {
  return render(
    <PaymentStep
      staffWorkflow
      deskCollect={deskCollect}
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

describe('the desk payment step names what to collect (MYK9-2149)', () => {
  beforeEach(() => {
    onPaymentMethodChange.mockClear();
    onPaymentDetailsChange.mockClear();
  });

  it('skips the payment choice when the form already covers the entry', () => {
    renderDeskStep({ kind: 'covered', heldCents: 4000 });

    expect(screen.getByRole('status')).toHaveTextContent('Already covered ($40.00 on this form)');
    expect(screen.queryByRole('button', { name: /^Cash received/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Cash \(pay at show\)/ })).not.toBeInTheDocument();
    // Submitted with nothing received: the covered flag, and no cash or check named.
    expect(onPaymentDetailsChange).toHaveBeenCalledWith(
      expect.objectContaining({ coveredByForm: true, receivedMethod: undefined })
    );
    expect(onPaymentMethodChange).toHaveBeenCalledWith('secretary_paid');
  });

  it('asks for exactly the difference when the form covers part of the entry', () => {
    renderDeskStep({ kind: 'partial', collectCents: 2000, heldCents: 1000 });

    expect(screen.getByText('Collect $20.00 ($10.00 already on this form)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Cash received/ })).toBeInTheDocument();
    expect(screen.queryByText(/Already covered/)).not.toBeInTheDocument();
    expect(onPaymentMethodChange).not.toHaveBeenCalled();
  });

  it('is unchanged when the form holds nothing extra', () => {
    renderDeskStep({ kind: 'unchanged' });

    expect(screen.queryByText(/already on this form/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Already covered/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Cash received/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Check \(pay at show\)/ })).toBeInTheDocument();
    expect(onPaymentMethodChange).not.toHaveBeenCalled();
    expect(onPaymentDetailsChange).not.toHaveBeenCalled();
  });

  it('drops "Already covered" once the form no longer covers the entry', () => {
    const { rerender } = renderDeskStep({ kind: 'covered', heldCents: 4000 }, 'secretary_paid');
    onPaymentDetailsChange.mockClear();

    rerender(
      <PaymentStep
        staffWorkflow
        deskCollect={{ kind: 'unchanged' }}
        paymentResolution={makePaymentResolution({
          paymentMethod: 'secretary_paid',
          cardCheckoutAvailable: false,
          isOnBehalf: true,
          canUseDeskPaymentActions: true,
        })}
        selectedDogs={['dog-1']}
        paymentMethod="secretary_paid"
        onPaymentMethodChange={onPaymentMethodChange}
        onPaymentDetailsChange={onPaymentDetailsChange}
        getPaymentDetails={() => ({})}
      />
    );

    expect(onPaymentDetailsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ coveredByForm: false })
    );
    expect(screen.getByText('Choose whether a check or cash came with this entry.')).toBeVisible();
  });
});
