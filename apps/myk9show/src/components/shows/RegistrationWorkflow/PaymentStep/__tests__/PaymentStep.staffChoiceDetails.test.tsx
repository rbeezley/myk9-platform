/**
 * MYK9-2162: each of the secretary's payment choices keeps its own details. A
 * check number typed under "Check received" is never saved as the reference of
 * "Cash received", and notes typed for money received never become the reason an
 * entry is free (or the other way round). Switching back restores what was typed
 * for that choice.
 *
 * "Saved" here is what the wizard holds (the last details the step sent) run
 * through `paymentDetailsForMethod`, the same pick the save makes. The wizard also
 * keeps the drafts for the entry, so going Back to Classes and returning (which
 * unmounts the step) keeps every choice's own details.
 */
import React, { useState } from 'react';
import { render, screen } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makePaymentResolution } from '@/test/utils/paymentResolution';
import { paymentDetailsForMethod } from '@/features/registration/paymentDetailsForMethod';
import type { PaymentDetails, PaymentMethod } from '@/types/show-registration-types';
import { PaymentStep } from '../index';
import { createStaffChoiceDraftStore } from '../useStaffChoiceDrafts';

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

let held: { method: PaymentMethod | ''; details: PaymentDetails };

/**
 * The wizard's side: it holds the method in state, the details in a ref and the
 * drafts in its store, and can leave the Payment step and come back.
 */
function StaffStep() {
  const [method, setMethod] = useState<PaymentMethod | ''>('');
  const [drafts] = useState(createStaffChoiceDraftStore);
  const [onPayment, setOnPayment] = useState(true);
  if (!onPayment) {
    return (
      <button type="button" onClick={() => setOnPayment(true)}>
        Next
      </button>
    );
  }
  return (
    <>
      <button type="button" onClick={() => setOnPayment(false)}>
        Back to Classes
      </button>
      <PaymentStep
        staffWorkflow
        paymentResolution={makePaymentResolution({
          paymentMethod: method,
          cardCheckoutAvailable: false,
          isOnBehalf: true,
          canUseDeskPaymentActions: true,
        })}
        selectedDogs={['dog-1']}
        paymentMethod={method}
        onPaymentMethodChange={next => {
          held.method = next;
          setMethod(next);
        }}
        onPaymentDetailsChange={details => {
          held.details = details;
        }}
        getPaymentDetails={() => held.details}
        choiceDrafts={drafts}
      />
    </>
  );
}

const choice = (name: RegExp) => screen.getByRole('button', { name });
const saved = () => paymentDetailsForMethod(held.method || undefined, held.details);

describe("the secretary's payment choices keep their own details (MYK9-2162)", () => {
  beforeEach(() => {
    held = { method: '', details: {} };
  });

  it('a check number typed, then a switch to cash received, saves cash with no check number', async () => {
    const { user } = render(<StaffStep />);

    await user.click(choice(/^Check received/));
    await user.type(screen.getByLabelText('Check number'), '1042');
    await user.click(choice(/^Cash received/));

    expect(held.method).toBe('secretary_paid');
    expect(held.details.receivedMethod).toBe('cash');
    // The payment's reference is read from the raw details.
    expect(held.details.paymentReference).toBe('');
    expect(saved()).not.toEqual(expect.objectContaining({ paymentReference: '1042' }));
    expect(screen.getByLabelText('Receipt #')).toHaveValue('');
  });

  it('switching back to check received restores its own number', async () => {
    const { user } = render(<StaffStep />);

    await user.click(choice(/^Check received/));
    await user.type(screen.getByLabelText('Check number'), '1042');
    await user.click(choice(/^Cash received/));
    await user.type(screen.getByLabelText('Receipt #'), 'R7');
    await user.click(choice(/^Check received/));

    expect(screen.getByLabelText('Check number')).toHaveValue('1042');
    expect(held.details).toEqual(
      expect.objectContaining({ receivedMethod: 'check', paymentReference: '1042' })
    );
  });

  it('payment notes typed, then a switch to Free entry, leave the free reason empty', async () => {
    const { user } = render(<StaffStep />);

    await user.click(choice(/^Cash received/));
    await user.type(screen.getByLabelText('Payment notes'), 'Paid in twenties');
    await user.click(choice(/^Free entry/));

    expect(held.method).toBe('waived');
    expect(screen.getByLabelText('Why is this entry free?')).toHaveValue('');
    expect(screen.getByLabelText('Why is this entry free?')).toBeRequired();
    expect(saved()).toEqual({ paymentNotes: '' });
  });

  it('a free reason typed, then a switch to cash received, does not become payment notes', async () => {
    const { user } = render(<StaffStep />);

    await user.click(choice(/^Free entry/));
    await user.type(screen.getByLabelText('Why is this entry free?'), 'Judge entry');
    await user.click(choice(/^Cash received/));

    expect(screen.getByLabelText('Payment notes')).toHaveValue('');
    expect(saved()).toEqual(expect.objectContaining({ paymentNotes: '' }));

    await user.click(choice(/^Free entry/));

    expect(screen.getByLabelText('Why is this entry free?')).toHaveValue('Judge entry');
    expect(saved()).toEqual({ paymentNotes: 'Judge entry' });
  });

  it("going Back to Classes and returning keeps each choice's own details", async () => {
    const { user } = render(<StaffStep />);

    await user.click(choice(/^Check received/));
    await user.type(screen.getByLabelText('Check number'), '1042');
    await user.click(choice(/^Cash received/));
    await user.type(screen.getByLabelText('Receipt #'), 'R7');
    await user.click(screen.getByRole('button', { name: 'Back to Classes' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByLabelText('Receipt #')).toHaveValue('R7');
    expect(held.details).toEqual(
      expect.objectContaining({ receivedMethod: 'cash', paymentReference: 'R7' })
    );

    await user.click(choice(/^Check received/));

    expect(screen.getByLabelText('Check number')).toHaveValue('1042');
    expect(held.details).toEqual(
      expect.objectContaining({ receivedMethod: 'check', paymentReference: '1042' })
    );

    await user.click(choice(/^Free entry/));

    expect(screen.getByLabelText('Why is this entry free?')).toHaveValue('');
    expect(saved()).toEqual({ paymentNotes: '' });
  });
});
