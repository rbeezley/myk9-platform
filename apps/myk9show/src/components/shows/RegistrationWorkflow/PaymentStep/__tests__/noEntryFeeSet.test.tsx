/**
 * MYK9-1931, owner rule "zero is never a price": a class with no entry fee set (the show has
 * no pre-entry fee, no day-of tier applies, the class has no fee of its own) cannot be bought
 * online. The wizard says so on the line and on the Payment step, and withdraws card, the
 * same refusal stripe-checkout makes before Stripe is called.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, renderHook, screen } from '@/test/utils/testUtils';
import { PaymentStep } from '../index';
import { usePaymentMethodResolution } from '../usePaymentMethodResolution';
import {
  findNoEntryFeeClassIds,
  hasNoEntryFeeSet,
  NO_ENTRY_FEE_MESSAGE,
  type ShowFeeInfo,
} from '../utils';
import { EntriesPanelLines } from '../../EntriesPanel/EntriesPanel.lines';
import type { PanelDogGroup } from '../../EntriesPanel/EntriesPanel.helpers';

// MYK9-2166: the open-time recheck of payouts readiness is covered in useFreshPayoutsKnownOff.test.tsx.
vi.mock('@/features/payments/useFreshPayoutsKnownOff', () => ({
  useFreshPayoutsKnownOff: () => false,
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ hasRole: () => false, userWithRoles: null }),
}));
vi.mock('@/hooks/useDogStoreCompat', () => ({ useDogStoreCompat: () => ({ dogs: [] }) }));
vi.mock('@/hooks/useClassStoreCompat', () => ({ useClassStoreCompat: () => ({ classes: [] }) }));
vi.mock('@/store/showStore', () => ({
  useShowStore: vi.fn(() => ({
    shows: [
      {
        id: 'show-1',
        clubId: 'club-1',
        organization: 'AKC',
        acceptCheckPayments: true,
        acceptCashPayments: true,
      },
    ],
  })),
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

const noFeeShow: ShowFeeInfo = {
  preEntryFee: '',
  dayOfShowFee: undefined,
  startDate: '2099-01-01',
};

describe('hasNoEntryFeeSet', () => {
  it('is true with no show fee and no class fee of its own', () => {
    expect(hasNoEntryFeeSet(noFeeShow, undefined, false)).toBe(true);
    expect(hasNoEntryFeeSet(noFeeShow, 0, false)).toBe(true);
  });

  it('is false when the class has its own fee, or the show has any fee that applies', () => {
    expect(hasNoEntryFeeSet(noFeeShow, 40, false)).toBe(false);
    expect(hasNoEntryFeeSet({ ...noFeeShow, preEntryFee: '25' }, undefined, false)).toBe(false);
    // Zero is never a price: a stored $0 pre-entry fee is unpriced too, as checkout refuses it.
    expect(hasNoEntryFeeSet({ ...noFeeShow, preEntryFee: '0' }, undefined, false)).toBe(true);
    expect(hasNoEntryFeeSet({ ...noFeeShow, preEntryFee: '0' }, 40, false)).toBe(false);
    // A day-of fee of 0 is no day-of tier, so it prices nothing.
    expect(hasNoEntryFeeSet({ ...noFeeShow, dayOfShowFee: '0' }, undefined, true)).toBe(true);
    expect(hasNoEntryFeeSet({ ...noFeeShow, dayOfShowFee: '30' }, undefined, true)).toBe(false);
    expect(hasNoEntryFeeSet({ ...noFeeShow, dayOfShowFee: '30' }, undefined, false)).toBe(true);
  });

  it('finds the selected payable classes with no fee, not wait-list requests', () => {
    const ids = findNoEntryFeeClassIds(
      ['dog-1'],
      [
        {
          dogId: 'dog-1',
          trialId: 't1',
          selectedClasses: [{ classId: 'c-none' }, { classId: 'c-own' }, { classId: 'c-wait' }],
        },
      ],
      [{ id: 'c-none' }, { id: 'c-own', entryFee: 40 }, { id: 'c-wait' }],
      noFeeShow,
      new Set(['c-wait'])
    );
    expect([...ids]).toEqual(['c-none']);
  });
});

describe('the wizard with a class that has no entry fee set', () => {
  it('withdraws card checkout and gives the reason', () => {
    const { result } = renderHook(() => usePaymentMethodResolution('show-1', 'credit_card', true));
    expect(result.current.cardCheckoutAvailable).toBe(false);
    expect(result.current.cardCheckoutUnavailableReason).toBe(NO_ENTRY_FEE_MESSAGE);
    expect(result.current.effectivePaymentMethod).not.toBe('credit_card');
  });

  it('keeps card when every class has a fee', () => {
    const { result } = renderHook(() => usePaymentMethodResolution('show-1', 'credit_card'));
    expect(result.current.cardCheckoutAvailable).toBe(true);
    expect(result.current.effectivePaymentMethod).toBe('credit_card');
  });

  it('says so on the Payment step', () => {
    function Harness() {
      const paymentResolution = usePaymentMethodResolution('show-1', '', true);
      return (
        <PaymentStep
          selectedDogs={[]}
          paymentMethod=""
          onPaymentMethodChange={vi.fn()}
          showId="show-1"
          paymentResolution={paymentResolution}
        />
      );
    }
    render(<Harness />);
    expect(screen.getAllByText(NO_ENTRY_FEE_MESSAGE).length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole('alert').some(alert => alert.textContent === NO_ENTRY_FEE_MESSAGE)
    ).toBe(true);
  });

  it('shows "No entry fee set yet" on the line instead of $0.00', () => {
    const groups: PanelDogGroup[] = [
      {
        dogId: 'dog-1',
        dogName: 'Rex',
        lines: [
          {
            lineKey: 'dog-1:c-none',
            classId: 'c-none',
            dayLabel: '',
            label: 'Detective',
            feeCents: 0,
          },
          {
            lineKey: 'dog-1:c-own',
            classId: 'c-own',
            dayLabel: '',
            label: 'Interior',
            feeCents: 4000,
          },
        ] as PanelDogGroup['lines'],
      },
    ];
    render(<EntriesPanelLines groups={groups} noEntryFeeClassIds={new Set(['c-none'])} />);
    expect(screen.getByText('No entry fee set yet')).toBeInTheDocument();
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument();
    expect(screen.getByText('$40.00')).toBeInTheDocument();
  });
});
