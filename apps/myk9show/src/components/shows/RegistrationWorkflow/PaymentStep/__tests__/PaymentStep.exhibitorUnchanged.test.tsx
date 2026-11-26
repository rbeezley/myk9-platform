/**
 * MYK9-2020: the secretary's payment step got its own choices, and the
 * exhibitor's own wizard must render exactly as it did before that change.
 *
 * The snapshot file was written by running this test against the code on
 * origin/main BEFORE the change (PaymentStep, PaymentMethodSelector), then the
 * changed code was put back and the test re-run without `-u`. It pins the full
 * rendered markup of the exhibitor's Payment step: a real exhibitor (no staff
 * permission), and a show's staff member who used the public "Enter This Show"
 * route (still the exhibitor workflow, so still the old list and desk card).
 */
import React from 'react';
import { render } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makePaymentResolution } from '@/test/utils/paymentResolution';
import type { PaymentMethod } from '@/types/show-registration-types';
import type { PaymentMethodResolution } from '../usePaymentMethodResolution';
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
const permission = vi.hoisted(() => ({ granted: false }));
vi.mock('@/components/rbac/PermissionGuard', () => ({
  PermissionGuard: ({ children }: { children: React.ReactNode }) =>
    permission.granted ? <>{children}</> : null,
}));

function renderExhibitorStep(
  paymentMethod: PaymentMethod | '',
  resolution: Partial<PaymentMethodResolution> = {}
) {
  return render(
    <PaymentStep
      paymentResolution={makePaymentResolution({ paymentMethod, ...resolution })}
      selectedDogs={['dog-1']}
      paymentMethod={paymentMethod}
      onPaymentMethodChange={vi.fn()}
      onPaymentDetailsChange={vi.fn()}
    />
  );
}

describe("the exhibitor's own Payment step is unchanged (MYK9-2020)", () => {
  beforeEach(() => {
    permission.granted = false;
  });

  it('an exhibitor paying by card', () => {
    const { container } = renderExhibitorStep('credit_card');
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('an exhibitor whose club takes no card, paying by check', () => {
    const { container } = renderExhibitorStep('check', {
      cardCheckoutAvailable: false,
      cardCheckoutUnavailableReason:
        "Online card payment isn't available for this club. Choose check or cash instead.",
    });
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('a staff member on the public entry route, recording money received', () => {
    permission.granted = true;
    const { container } = renderExhibitorStep('secretary_paid', {
      cardCheckoutAvailable: false,
      isOnBehalf: true,
      canUseDeskPaymentActions: true,
    });
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('a staff member on the public entry route, making the entry free', () => {
    permission.granted = true;
    const { container } = renderExhibitorStep('waived', {
      cardCheckoutAvailable: false,
      isOnBehalf: true,
      canUseDeskPaymentActions: true,
    });
    expect(container.innerHTML).toMatchSnapshot();
  });
});
