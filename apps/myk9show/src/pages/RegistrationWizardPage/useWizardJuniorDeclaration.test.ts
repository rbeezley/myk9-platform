import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@/test/utils/testUtils';
import { calculateTotalFees } from '@/components/shows/RegistrationWorkflow/PaymentStep/utils';

/**
 * MYK9-879 (Codex round 2): declarations are offered and priced from the EFFECTIVE
 * payment method, the value PaymentStep and the entries panel use, not the raw
 * selection. A restored draft that selected card while the club's Stripe readiness
 * is still pending is paying by check/cash for the moment.
 */
const mocks = vi.hoisted(() => ({
  readiness: { isSuccess: false, isPending: true, isFetching: true, data: undefined as unknown },
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ hasRole: () => false, userWithRoles: { scopes: [] } }),
}));
vi.mock('@/hooks/useRegistrationPermissions', () => ({
  useRegistrationPermissions: () => ({
    isSecretary: false,
    isClubAdmin: false,
    isSiteAdmin: false,
  }),
}));
vi.mock('@/features/payments/useClubStripeAccount', () => ({
  useClubStripePaymentReadiness: () => mocks.readiness,
}));
const SHOW = {
  id: 'show-1',
  clubId: 'club-1',
  organization: 'AKC',
  acceptCheckPayments: true,
  acceptCashPayments: true,
  preEntryFee: '30',
  juniorHandlerFee: '15',
  startDate: '2099-05-01',
};
vi.mock('@/store/showStore', () => ({ useShowStore: () => ({ shows: [SHOW] }) }));

import { useWizardJuniorDeclaration } from './useWizardJuniorDeclaration';

const selectedDogs = ['dog-1', 'dog-2'];
const classSelections = [
  { dogId: 'dog-1', trialId: 't1', selectedClasses: [{ classId: 'c1' }] },
  { dogId: 'dog-2', trialId: 't1', selectedClasses: [{ classId: 'c1' }] },
];
const classes = [{ id: 'c1', className: 'A', entryFee: 28 }];
const dogs = [
  { id: 'dog-1', name: 'Rocket' },
  { id: 'dog-2', name: 'Juno' },
];

function total(declared: ReadonlySet<string>) {
  return calculateTotalFees(
    selectedDogs,
    classSelections,
    dogs,
    classes,
    { preEntryFee: '30', juniorHandlerFee: '15', startDate: '2099-05-01' },
    new Set(),
    declared
  ).total;
}

function pendingStripe() {
  mocks.readiness = { isSuccess: false, isPending: true, isFetching: true, data: undefined };
}
function readyStripe() {
  mocks.readiness = { isSuccess: true, isPending: false, isFetching: false, data: true };
}

describe('useWizardJuniorDeclaration uses the EFFECTIVE payment method', () => {
  beforeEach(pendingStripe);

  function mount() {
    return renderHook(
      () =>
        useWizardJuniorDeclaration({
          showId: 'show-1',
          selectedDogs,
          selectedPaymentMethod: 'credit_card',
          show: SHOW,
        }),
      {}
    );
  }

  it('restored draft with card selected while Stripe is pending: effective is check, nothing offered or priced', () => {
    const hook = mount();
    // Restore the draft's ticks (what handleDraftLoaded does).
    act(() => hook.result.current.setJuniorHandlerDogs(['dog-1']));

    expect(hook.result.current.paymentResolution.effectivePaymentMethod).toBe('check');
    expect(hook.result.current.canDeclareJuniorHandler).toBe(false);
    expect(hook.result.current.juniorHandlerDogIds.size).toBe(0);
    // Totals are normal.
    expect(total(hook.result.current.juniorHandlerDogIds)).toBe(60);
  });

  it('when Stripe becomes ready the declarations apply again, none lost', () => {
    const hook = mount();
    act(() => hook.result.current.setJuniorHandlerDogs(['dog-1']));
    expect(hook.result.current.juniorHandlerDogIds.size).toBe(0);

    readyStripe();
    hook.rerender();

    expect(hook.result.current.paymentResolution.effectivePaymentMethod).toBe('credit_card');
    expect(hook.result.current.canDeclareJuniorHandler).toBe(true);
    expect([...hook.result.current.juniorHandlerDogIds]).toEqual(['dog-1']);
    expect(total(hook.result.current.juniorHandlerDogIds)).toBe(45);
  });
});
