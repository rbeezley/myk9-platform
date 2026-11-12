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
 * MYK9-1822: the payment step no longer shows a total of its own; the wizard's
 * one total is the entries panel's "Total due", fed by the page's
 * `liveFeeCalculation`. So these cases render the step beside the panel, with
 * the fee calculation built exactly as `useRegistrationWizardState` builds it
 * (show fields plus the resolved zone, or `undefined` until the zone is known).
 *
 * Mutation check (run): drop `entryWindowTimezone` from `pageFees` below and
 * the two zone cases stop disagreeing, so the Eastern positive control goes red.
 *
 * The hook is stubbed with a small mutable object rather than a per-test module
 * re-import, because three `vi.mock` factories in this file already pin the
 * store layer. EVERY test sets both fields explicitly before rendering — not
 * just `beforeEach` — so no case depends on the order the file runs in.
 */

import React from 'react';
import { render, screen, within } from '@/test/utils/testUtils';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PaymentStep } from '../index';
import { usePaymentMethodResolution } from '../usePaymentMethodResolution';
import type { PaymentStepProps } from '../types';
import { calculateTotalFees } from '../utils';
import { EntriesPanel } from '../../EntriesPanel/EntriesPanel';
import { panelGroupsFromFees } from '@/test/utils/entriesPanelFromFees';

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

const DOGS = [{ id: 'dog-1', name: 'Rocket', callName: 'Rocket' }];
const CLASSES = [{ id: 'class-1', className: 'Interior Novice A' }];
const CLASS_SELECTIONS = [
  { dogId: 'dog-1', trialId: 'trial-1', selectedClasses: [{ classId: 'class-1' }] },
];

vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: () => ({ dogs: DOGS }),
}));
vi.mock('@/hooks/queries/usePlatformFeeRates', () => ({
  usePlatformFeeRates: () => ({ percent: 0, flatCents: 0, minCents: 0 }),
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

/** The page's `liveFeeCalculation`, field for field. */
function pageFees() {
  return calculateTotalFees(
    ['dog-1'],
    CLASS_SELECTIONS,
    DOGS,
    CLASSES,
    entryWindowTimezone.isReady
      ? {
          preEntryFee: SHOW.preEntryFee || '0',
          dayOfShowFee: SHOW.dayOfShowFee,
          startDate: SHOW.startDate,
          entryCloseDate: SHOW.entryCloseDate,
          entryWindowTimezone: entryWindowTimezone.timeZone,
        }
      : undefined,
    new Set()
  );
}

/** The payment step and the entries panel, side by side as the page renders them. */
function Harness(props: Omit<PaymentStepProps, 'paymentResolution'>) {
  const paymentResolution = usePaymentMethodResolution(props.showId, props.paymentMethod);
  const feeCalculation = pageFees();
  return (
    <>
      <PaymentStep {...props} paymentResolution={paymentResolution} />
      <EntriesPanel
        groups={panelGroupsFromFees(feeCalculation)}
        variant="payment"
        paymentMethod={paymentResolution.effectivePaymentMethod}
        feeCalculation={feeCalculation}
        feeTier={{ isReady: entryWindowTimezone.isReady, isUnavailable: false }}
      />
    </>
  );
}

const baseProps = {
  selectedDogs: ['dog-1'],
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

  /** The wizard's one total on screen: the entries panel's "Total due" row. */
  const totalDue = () =>
    within(screen.getByTestId('entries-panel')).getByText('Total due').parentElement;

  it('shows the loading state and NO fee while the trial read is unfinished', () => {
    entryWindowTimezone.timeZone = 'America/Chicago';
    entryWindowTimezone.isReady = false;
    render(<Harness {...baseProps} />);

    expect(screen.getByText(/Loading show details before totalling this entry/i)).toBeVisible();
    // Neither tier, and no dollar figure at all: $35 in particular would be the
    // Eastern-fallback answer that the offline desk path writes straight to the
    // database. The total says it is still working out the fees.
    expect(screen.queryByText(/\$\d/)).toBeNull();
    expect(totalDue()).toHaveTextContent('Checking fees');
  });

  it("totals in the show's own zone once the read finishes", () => {
    entryWindowTimezone.timeZone = 'America/Chicago';
    entryWindowTimezone.isReady = true;
    render(<Harness {...baseProps} />);

    expect(screen.queryByText(/Loading show details before totalling this entry/i)).toBeNull();

    expect(totalDue()).toHaveTextContent('$30.00');
    expect(totalDue()).not.toHaveTextContent('$35.00');
  });

  it('would total $35 on the Eastern fallback — the value the zone plumbing removes', () => {
    entryWindowTimezone.timeZone = 'America/New_York';
    entryWindowTimezone.isReady = true;
    render(<Harness {...baseProps} />);

    // Same instant, same show, one different zone. This is the positive control
    // for the test above: without it, "$30" could be a fee that never depended
    // on the zone at all.
    expect(totalDue()).toHaveTextContent('$35.00');
  });
});
