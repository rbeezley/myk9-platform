/**
 * MYK9-879 (Codex P2): junior declarations persist with the registration draft.
 *
 * Before this, a Continue Shopping or a reload initialized the declarations empty,
 * so the retained dogs/classes came back at the normal fee and re-submitting
 * replaced the junior-priced cart with undeclared lines.
 *
 * These drive the REAL pieces end to end: the hook (tick), `buildDraftFormData`
 * (what the draft store receives), `createWizardHandlers.handleDraftLoaded` (what
 * the restore does with it) and a SECOND hook instance standing in for the
 * remounted wizard, then compare the exact cart lines before and after.
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildDraftFormData } from './buildDraftFormData';
import { createWizardHandlers } from './wizardHandlers';
import { useJuniorHandlerDeclaration } from './useJuniorHandlerDeclaration';
import { registrationToCartItems } from '@/utils/registrationToCartItems';
import { calculateTotalFees } from '@/components/shows/RegistrationWorkflow/PaymentStep/utils';
import { PaymentStatus, EntryStatus } from '@/types/show-registration-types';
import type { ClassSelectionData, RegistrationFormData } from '@/types/show-registration-types';
import type { SavedDraft } from '@/hooks/useDraftPersistence';
import type { RegistrationWizardState } from './useRegistrationWizardState';

vi.mock('@/lib/notifications', () => ({
  notifications: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const show = { juniorHandlerFee: '15', organization: 'AKC' };
const showFeeInfo = { preEntryFee: '30', juniorHandlerFee: '15', startDate: '2099-05-01' };
const classSelections: ClassSelectionData[] = [
  { dogId: 'dog-1', trialId: 't1', selectedClasses: [{ classId: 'class-1' }] },
  {
    dogId: 'dog-2',
    trialId: 't1',
    selectedClasses: [{ classId: 'class-1' }, { classId: 'class-2' }],
  },
];
const classes = [
  { id: 'class-1', className: 'A', entryFee: 28 },
  { id: 'class-2', className: 'B', entryFee: 28 },
];
const dogs = [
  { id: 'dog-1', name: 'Rocket' },
  { id: 'dog-2', name: 'Juno' },
];
const selectedDogs = ['dog-1', 'dog-2'];

function wizardHook() {
  return renderHook(() =>
    useJuniorHandlerDeclaration({ selectedDogs, paymentMethod: 'credit_card', show })
  );
}

function cartLines(declared: ReadonlySet<string>) {
  return registrationToCartItems(classSelections, {}, classes, showFeeInfo, declared).map(i => [
    i.dogId,
    i.classId,
    i.entryFeeCents,
    i.juniorFeeDeclared ?? false,
  ]);
}

function savedDraftFor(declaredDogIds: readonly string[]): SavedDraft {
  const data = buildDraftFormData({
    registrationData: {
      selectedDogs,
      entries: [],
      documents: [],
      paymentMethod: 'credit_card',
    } as RegistrationFormData,
    currentStepId: 'payment',
    stepCompletionState: {},
    classSelections,
    handlerAssignments: {},
    paymentStatus: PaymentStatus.PENDING,
    entryStatus: EntryStatus.PENDING,
    juniorHandlerDogIds: declaredDogIds,
  });
  return { metadata: { id: 'd1' }, data } as unknown as SavedDraft;
}

function restoreInto(restored: ReturnType<typeof wizardHook>['result'], draft: SavedDraft) {
  const state = {
    dogsReady: false,
    pendingDraftRegistrationRef: { current: false },
    activateDraft: vi.fn(),
    currentWorkflowConfig: { steps: ['dog-selection', 'class-selection', 'payment'] },
    setStepCompletionState: vi.fn(),
    setClassSelections: vi.fn(),
    setHandlerAssignments: vi.fn(),
    setPaymentStatus: vi.fn(),
    setEntryStatus: vi.fn(),
    setCurrentStep: vi.fn(),
    setRegistrationData: vi.fn(),
    setJuniorHandlerDogs: (ids: readonly string[]) => restored.current.setJuniorHandlerDogs(ids),
  } as unknown as RegistrationWizardState;
  return createWizardHandlers(state).handleDraftLoaded(draft, { silent: true });
}

describe('buildDraftFormData', () => {
  it('persists the declared dogs in the workflow snapshot, and an empty list when none', () => {
    expect(savedDraftFor(['dog-2']).data._workflowState?.juniorHandlerDogIds).toEqual(['dog-2']);
    expect(savedDraftFor([]).data._workflowState?.juniorHandlerDogIds).toEqual([]);
  });
});

describe('junior declarations round-trip through the draft', () => {
  it('tick, leave to the cart, Continue Shopping: still ticked, preview and cart lines unchanged', () => {
    const first = wizardHook();
    act(() => first.result.current.setJuniorHandlerDog('dog-1', true));
    const before = {
      lines: cartLines(first.result.current.juniorHandlerDogIds),
      total: calculateTotalFees(
        selectedDogs,
        classSelections,
        dogs,
        classes,
        showFeeInfo,
        new Set(),
        first.result.current.juniorHandlerDogIds
      ).total,
    };
    expect(before.lines).toEqual([
      ['dog-1', 'class-1', 1500, true],
      ['dog-2', 'class-1', 3000, false],
      ['dog-2', 'class-2', 3000, false],
    ]);
    expect(before.total).toBe(75);

    // What the draft store holds when the wizard unmounts for the cart.
    const draft = savedDraftFor(first.result.current.declaredDogIdList);
    first.unmount();

    // A fresh wizard mounts (Continue Shopping) and restores the draft.
    const second = wizardHook();
    expect(second.result.current.juniorHandlerDogIds.size).toBe(0);
    let ok: boolean | undefined;
    act(() => {
      ok = restoreInto(second.result, draft);
    });
    expect(ok).toBe(true);

    expect([...second.result.current.juniorHandlerDogIds]).toEqual(['dog-1']);
    expect(cartLines(second.result.current.juniorHandlerDogIds)).toEqual(before.lines);
    expect(
      calculateTotalFees(
        selectedDogs,
        classSelections,
        dogs,
        classes,
        showFeeInfo,
        new Set(),
        second.result.current.juniorHandlerDogIds
      ).total
    ).toBe(before.total);
  });

  it('a reload from the draft restores a tick made while paying another way', () => {
    // The tick is kept even though it is not priced for check or cash.
    const first = renderHook(
      (p: { paymentMethod: string }) =>
        useJuniorHandlerDeclaration({ selectedDogs, paymentMethod: p.paymentMethod, show }),
      { initialProps: { paymentMethod: 'credit_card' } }
    );
    act(() => first.result.current.setJuniorHandlerDog('dog-2', true));
    first.rerender({ paymentMethod: 'check' });
    expect(first.result.current.juniorHandlerDogIds.size).toBe(0);
    const draft = savedDraftFor(first.result.current.declaredDogIdList);

    const second = wizardHook();
    act(() => {
      restoreInto(second.result, draft);
    });
    expect([...second.result.current.juniorHandlerDogIds]).toEqual(['dog-2']);
  });

  it('a draft saved before declarations existed restores an empty set', () => {
    const second = wizardHook();
    act(() => second.result.current.setJuniorHandlerDog('dog-1', true));
    const legacy = savedDraftFor([]);
    delete (legacy.data._workflowState as { juniorHandlerDogIds?: unknown }).juniorHandlerDogIds;
    act(() => {
      restoreInto(second.result, legacy);
    });
    expect(second.result.current.juniorHandlerDogIds.size).toBe(0);
  });
});

describe('the persisted set wins: tick, cart, return, UNTICK, reload', () => {
  it('stays unticked after a reload, and the preview and lines match the un-ticked state', () => {
    const first = wizardHook();
    act(() => first.result.current.setJuniorHandlerDog('dog-1', true));
    const draftAtCart = savedDraftFor(first.result.current.declaredDogIdList);
    first.unmount();

    // Return via Continue Shopping, then un-tick before re-submitting.
    const second = wizardHook();
    act(() => {
      restoreInto(second.result, draftAtCart);
    });
    expect([...second.result.current.juniorHandlerDogIds]).toEqual(['dog-1']);
    act(() => second.result.current.setJuniorHandlerDog('dog-1', false));
    // The draft store now holds the empty set (the key present, the list empty).
    const draftAfterUntick = savedDraftFor(second.result.current.declaredDogIdList);
    expect(draftAfterUntick.data._workflowState?.juniorHandlerDogIds).toEqual([]);
    second.unmount();

    // Reload from that draft. The (stale) cart would still say dog-1 is declared, but
    // a present key means the cart is not consulted (see the rehydration test).
    const third = wizardHook();
    act(() => {
      restoreInto(third.result, draftAfterUntick);
    });
    expect(third.result.current.juniorHandlerDogIds.size).toBe(0);
    expect(cartLines(third.result.current.juniorHandlerDogIds)).toEqual([
      ['dog-1', 'class-1', 3000, false],
      ['dog-2', 'class-1', 3000, false],
      ['dog-2', 'class-2', 3000, false],
    ]);
    expect(
      calculateTotalFees(
        selectedDogs,
        classSelections,
        dogs,
        classes,
        showFeeInfo,
        new Set(),
        third.result.current.juniorHandlerDogIds
      ).total
    ).toBe(90);
  });
});
