/**
 * MYK9-879: the exhibitor's per-dog "handler is under 18" declaration on the
 * payment step, rendered on the REAL prop shape the wizard page hands down.
 *
 * What the test pins:
 *  - the control is offered only when the page says the declaration is available
 *    AND the show has a junior tier, and its wording is about the HANDLER (the
 *    person showing the dog), not the registrant;
 *  - ticking reports the dog to the page;
 *  - the wizard's total is the exact amount checkout will charge: 15.00 for a
 *    declared dog, 30.00 for an undeclared one (a different dog in the same
 *    registration). Since MYK9-1822 the step shows no total of its own; the one
 *    on screen is the entries panel's "Total due", fed by the page's
 *    `liveFeeCalculation`, so the harness renders that panel beside the step
 *    with the calculation built the way `useRegistrationWizardState` builds it.
 *
 * The step needs the hosting show's real shape: pre-entry 30, junior fee 15.
 */
import React from 'react';
import { render, screen, within } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaymentStep } from '../index';
import { usePaymentMethodResolution } from '../usePaymentMethodResolution';
import type { PaymentStepProps } from '../types';
import { calculateTotalFees } from '../utils';
import { EntriesPanel } from '../../EntriesPanel/EntriesPanel';
import { panelGroupsFromFees } from '@/test/utils/entriesPanelFromFees';

const SHOW = {
  id: 'show-1',
  clubId: 'club-1',
  organization: 'AKC',
  acceptCheckPayments: true,
  acceptCashPayments: true,
  preEntryFee: '30.00',
  dayOfShowFee: '45.00',
  juniorHandlerFee: '15.00' as string | undefined,
  startDate: '2026-11-07T00:00:00+00:00',
  entryCloseDate: '2026-12-01T00:00:00+00:00',
};

const DOGS = [
  { id: 'dog-1', name: 'Rocket', callName: 'Rocket' },
  { id: 'dog-2', name: 'Juno', callName: 'Juno' },
];
const CLASSES = [{ id: 'class-1', className: 'Interior Novice A' }];
const CLASS_SELECTIONS = [
  { dogId: 'dog-1', trialId: 'trial-1', selectedClasses: [{ classId: 'class-1' }] },
  { dogId: 'dog-2', trialId: 'trial-1', selectedClasses: [{ classId: 'class-1' }] },
];

vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: () => ({ dogs: DOGS }),
}));
// No service fee, so "Total due" is the entry fees alone.
vi.mock('@/hooks/queries/usePlatformFeeRates', () => ({
  usePlatformFeeRates: () => ({ percent: 0, flatCents: 0, minCents: 0 }),
}));
vi.mock('@/store/showStore', () => ({
  useShowStore: vi.fn(() => ({ shows: [SHOW] })),
}));
vi.mock('@/features/payments/useClubStripeAccount', () => ({
  useClubStripePaymentReadiness: vi.fn(() => ({
    data: true,
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
vi.mock('@/hooks/useEntryWindowTimezone', () => ({
  useEntryWindowTimezone: () => ({ timeZone: 'America/Chicago', isReady: true }),
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

/** The payment step and the entries panel, side by side as the page renders them. */
function Harness(props: Omit<PaymentStepProps, 'paymentResolution'>) {
  const paymentResolution = usePaymentMethodResolution(props.showId, props.paymentMethod);
  // The page's `liveFeeCalculation`, field for field (zone resolved: Chicago).
  const feeCalculation = calculateTotalFees(
    props.selectedDogs,
    CLASS_SELECTIONS,
    DOGS,
    CLASSES,
    {
      preEntryFee: SHOW.preEntryFee || '0',
      dayOfShowFee: SHOW.dayOfShowFee,
      juniorHandlerFee: SHOW.juniorHandlerFee,
      startDate: SHOW.startDate,
      entryCloseDate: SHOW.entryCloseDate,
      entryWindowTimezone: 'America/Chicago',
    },
    new Set(),
    props.juniorDeclaration?.dogIds
  );
  return (
    <>
      <PaymentStep {...props} paymentResolution={paymentResolution} />
      <EntriesPanel
        groups={panelGroupsFromFees(feeCalculation)}
        variant="payment"
        paymentMethod={paymentResolution.effectivePaymentMethod}
        feeCalculation={feeCalculation}
      />
    </>
  );
}

const onChange = vi.fn();

function propsFor(overrides: Partial<PaymentStepProps> = {}) {
  return {
    selectedDogs: ['dog-1', 'dog-2'],
    paymentMethod: 'credit_card' as const,
    onPaymentMethodChange: vi.fn(),
    showId: 'show-1',
    juniorDeclaration: { canDeclare: true, dogIds: new Set<string>(), onChange },
    ...overrides,
  } as unknown as Omit<PaymentStepProps, 'paymentResolution'>;
}

describe('PaymentStep junior-handler declaration', () => {
  beforeEach(() => {
    onChange.mockReset();
    SHOW.juniorHandlerFee = '15.00';
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-10-01T12:00:00Z'));
  });

  /** The wizard's one total on screen: the entries panel's "Total due" row. */
  const totalDue = () =>
    within(screen.getByTestId('entries-panel')).getByText('Total due').parentElement;

  it('offers one checkbox per dog, worded about the handler, not the registrant', () => {
    render(<Harness {...propsFor()} />);

    expect(screen.getByText('Junior handler fee ($15.00)')).toBeVisible();
    const rocket = screen.getByRole('checkbox', { name: /junior handler fee\) for Rocket/i });
    const juno = screen.getByRole('checkbox', { name: /junior handler fee\) for Juno/i });
    expect(rocket).toBeVisible();
    expect(juno).toBeVisible();
    expect(screen.getAllByText(/Handler is under 18/i)).toHaveLength(2);
    // The help text says the question is about the person showing the dog.
    expect(screen.getByText(/the person showing it is under 18/i)).toBeVisible();
    expect(screen.getByText(/about the handler, not the owner/i)).toBeVisible();
  });

  it('reports the tick for that dog to the page', async () => {
    render(<Harness {...propsFor()} />);
    await userEvent.click(screen.getByRole('checkbox', { name: /junior handler fee\) for Juno/i }));
    expect(onChange).toHaveBeenCalledWith('dog-2', true);
  });

  it('is hidden when the page does not offer the declaration (check, cash, ASCA)', () => {
    render(
      <Harness
        {...propsFor({ juniorDeclaration: { canDeclare: false, dogIds: new Set(), onChange } })}
      />
    );
    expect(screen.queryByText(/Handler is under 18/i)).toBeNull();
  });

  it('is hidden when the show has no junior tier, even if the page offers it', () => {
    SHOW.juniorHandlerFee = undefined;
    render(<Harness {...propsFor()} />);
    expect(screen.queryByText(/Handler is under 18/i)).toBeNull();
  });

  it('totals a declared dog at the junior fee and an undeclared dog at the normal fee', () => {
    render(
      <Harness
        {...propsFor({
          juniorDeclaration: { canDeclare: true, dogIds: new Set(['dog-1']), onChange },
        })}
      />
    );
    // 15.00 (Rocket, declared) + 30.00 (Juno) = 45.00
    expect(totalDue()).toHaveTextContent('$45.00');
    expect(totalDue()).not.toHaveTextContent('$60.00');
  });

  it('totals both dogs at the normal fee with no declaration', () => {
    render(<Harness {...propsFor()} />);
    expect(totalDue()).toHaveTextContent('$60.00');
  });
});
