/**
 * MYK9-642 round 2, L-F1 + L-F2.
 *
 * The day-of-show fee tier is decided in the SHOW's timezone. Two ways that
 * went wrong on this step:
 *
 *   L-F2 — `paymentResolution.show` comes from the show store and carries no
 *   zone, so `calculateTotalFees` fell through to the viewer's browser zone
 *   while the submission path and `submit_show_entries` used the show's own.
 *   L-F1 — the trial store that resolves the zone hydrates asynchronously, and
 *   the wizard can mount straight onto this step with a Submit button
 *   (`useWizardDraftRehydration`: a reload, or the return from a cancelled
 *   Stripe checkout). Until the read finishes the rule answers with the
 *   `America/New_York` fallback, and `submitOfflineLateEntry` would WRITE that
 *   amount with no server to correct it.
 *
 * The fixture is the live "Heartland UKC Nosework Trial" shape at 23:30 CT the
 * evening before the show: pre-entry in `America/Chicago` ($30), day-of under
 * the Eastern fallback ($35). One instant, two answers — so a fee of 35 on
 * screen IS the bug, and 30 is the tier `submit_show_entries` computes.
 *
 * Mutation check: drop the `entryWindowTimezoneReady` gate in
 * `PaymentStep/index.tsx` and the not-ready case goes red — the fee-bearing
 * card is rendered.
 *
 * The hook is stubbed with a mutable object rather than a per-test module
 * re-import because three `vi.mock` factories in this file already pin the
 * store layer; the two fields are reset in `beforeEach`.
 */

import React from 'react';
import { render, screen } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PaymentStep } from '../index';
import { usePaymentMethodResolution } from '../usePaymentMethodResolution';
import type { PaymentStepProps } from '../types';

const SHOW = {
  id: 'show-1',
  clubId: 'club-1',
  organization: 'UKC',
  acceptCheckPayments: true,
  acceptCashPayments: true,
  preEntryFee: '30.00',
  dayOfShowFee: '35.00',
  startDate: '2026-11-07T00:00:00+00:00',
  entryCloseDate: '2026-12-01T00:00:00+00:00',
};

vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: () => ({ dogs: [{ id: 'dog-1', name: 'Rocket', callName: 'Rocket' }] }),
}));
vi.mock('@/hooks/useClassStoreCompat', () => ({
  useClassStoreCompat: () => ({ classes: [{ id: 'class-1', className: 'Interior Novice A' }] }),
}));
vi.mock('@/store/showStore', () => ({
  useShowStore: vi.fn(() => ({ shows: [SHOW] })),
}));
vi.mock('@/features/payments/useClubStripeAccount', () => ({
  useClubStripePaymentReadiness: vi.fn(() => ({
    data: false,
    isPending: false,
    isFetching: false,
    isError: false,
    isSuccess: true,
  })),
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
const entryWindowTimezone = { timeZone: 'America/Chicago', isReady: true };
vi.mock('@/hooks/useEntryWindowTimezone', () => ({
  useEntryWindowTimezone: () => entryWindowTimezone,
}));
vi.mock('@/hooks/queries/useOrganizationAgreement', () => ({
  useOrganizationAgreement: () => ({
    data: null,
    isLoading: false,
    isError: false,
    isFetching: false,
    isSuccess: true,
    isPlaceholderData: false,
    refetch: vi.fn(),
  }),
}));

function Harness(props: Omit<PaymentStepProps, 'paymentResolution'>) {
  const paymentResolution = usePaymentMethodResolution(props.showId, props.paymentMethod);
  return <PaymentStep {...props} paymentResolution={paymentResolution} />;
}

const baseProps = {
  selectedDogs: ['dog-1'],
  classSelections: [
    { dogId: 'dog-1', trialId: 'trial-1', selectedClasses: [{ classId: 'class-1' }] },
  ],
  paymentMethod: '' as const,
  onPaymentMethodChange: vi.fn(),
  showId: 'show-1',
} as unknown as Omit<PaymentStepProps, 'paymentResolution'>;

describe('PaymentStep — no total until the show timezone is known', () => {
  beforeEach(() => {
    entryWindowTimezone.timeZone = 'America/Chicago';
    entryWindowTimezone.isReady = true;
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // 23:30 CT on Nov 6: America/Chicago says pre-entry, America/New_York says day-of.
    vi.setSystemTime(new Date('2026-11-07T05:30:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * The running total lives in Secretary Payment Management's Reconciliation
   * tab, which mounts lazily — so the tab has to be opened before the number
   * exists in the DOM. When the step is not ready the whole card is absent, and
   * the tab cannot be opened at all, which is the assertion below.
   */
  async function openReconciliation(): Promise<void> {
    await userEvent.click(screen.getByRole('tab', { name: /Reconciliation/i }));
  }

  it('shows the loading state and NO fee while the trial read is unfinished', () => {
    entryWindowTimezone.isReady = false;
    render(<Harness {...baseProps} />);

    expect(screen.getByText(/Loading show details before totalling this entry/i)).toBeVisible();
    // Neither tier, and no way to reach one: the fee-bearing card is not
    // rendered at all. $35 in particular would be the Eastern-fallback answer
    // that the offline desk path writes straight to the database.
    expect(screen.queryByRole('tab', { name: /Reconciliation/i })).toBeNull();
    expect(screen.queryByText('Secretary Payment Management')).toBeNull();
    expect(screen.queryByText('$35')).toBeNull();
    expect(screen.queryByText('$30')).toBeNull();
    expect(screen.queryByText('Total Fees')).toBeNull();
  });

  it("totals in the show's own zone once the read finishes", async () => {
    render(<Harness {...baseProps} />);

    expect(screen.queryByText(/Loading show details before totalling this entry/i)).toBeNull();
    await openReconciliation();

    expect(screen.getByText('$30')).toBeVisible();
    expect(screen.queryByText('$35')).toBeNull();
  });

  it('would total $35 on the Eastern fallback — the value the zone plumbing removes', async () => {
    entryWindowTimezone.timeZone = 'America/New_York';
    render(<Harness {...baseProps} />);
    await openReconciliation();

    // Same instant, same show, one different zone. This is the positive control
    // for the test above: without it, "$30" could be a fee that never depended
    // on the zone at all.
    expect(screen.getByText('$35')).toBeVisible();
  });
});
