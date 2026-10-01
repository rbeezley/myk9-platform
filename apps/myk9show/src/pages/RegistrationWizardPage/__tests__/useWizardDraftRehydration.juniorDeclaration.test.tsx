/**
 * MYK9-879 (Codex P2): when the wizard rehydrates and the cart still carries each
 * line's `junior_fee_declared`, those dogs' declarations are restored from the
 * cart, so a draft saved without them (or before the last tick landed) does not
 * bring the retained dogs back at the normal fee. Same guards as the cart
 * reconcile: this show, this exhibitor, once.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render } from '@testing-library/react';
import { useWizardDraftRehydration } from '../useWizardDraftRehydration';
import { markWizardSessionOpen } from '@/hooks/wizardDraftSession';
import type { DraftMetadata, SavedDraft } from '@/hooks/draftMetadata';
import type { RegistrationWizardState } from '../useRegistrationWizardState';
import type { createWizardHandlers } from '../wizardHandlers';

const SHOW = 'show-1';
const USER = 'user-1';
const PROFILE = 'profile-1';

const cart = { show_id: SHOW as string | null, exhibitor_id: PROFILE as string | null };
type Row = { id: string; dog_id: string; class_id: string; junior_fee_declared: boolean };
const cartItems: Row[] = [];
const row = (dogId: string, classId: string, declared: boolean): Row => ({
  id: `i-${dogId}-${classId}`,
  dog_id: dogId,
  class_id: classId,
  junior_fee_declared: declared,
});

vi.mock('@/store/cartStore', () => ({
  useCartItems: () => cartItems,
  useCartStore: (selector: (s: unknown) => unknown) =>
    selector({ cart, isLoading: false } as unknown),
}));

const meta = {
  id: 'd1',
  showId: SHOW,
  userId: USER,
  timestamp: Date.now(),
  stepCompleted: 'payment',
  title: 'Draft',
  preview: '2 dogs',
  selectedDogsCount: 2,
  completed: false,
} as DraftMetadata;

const addJuniorHandlerDogs = vi.fn();

function Harness() {
  const [, force] = useState(0);
  const state = {
    showId: SHOW,
    userId: USER,
    isInsideSidebar: false,
    availableDrafts: [meta],
    draftLoad: () => ({ metadata: meta, data: { selectedDogs: ['dog-1', 'dog-2'] } }) as SavedDraft,
    currentStepId: 'payment',
    registrationData: { selectedDogs: [], entries: [], documents: [] },
    classSelections: [],
    exhibitorProfile: { id: PROFILE },
    addJuniorHandlerDogs,
  } as unknown as RegistrationWizardState;
  const handlers = {
    handleDraftLoaded: () => {
      force(n => n + 1);
      return true;
    },
    handleClassSelectionChange: () => {},
  } as unknown as ReturnType<typeof createWizardHandlers>;
  useWizardDraftRehydration(state, handlers);
  return null;
}

beforeEach(() => {
  sessionStorage.clear();
  addJuniorHandlerDogs.mockReset();
  cart.show_id = SHOW;
  cart.exhibitor_id = PROFILE;
  cartItems.splice(
    0,
    cartItems.length,
    row('dog-1', 'class-1', true),
    row('dog-1', 'class-2', true),
    row('dog-2', 'class-1', false)
  );
});

describe('rehydration restores declarations from the cart lines', () => {
  it('adds each declared dog once, and not the undeclared one', () => {
    markWizardSessionOpen(SHOW, USER);
    render(<Harness />);
    expect(addJuniorHandlerDogs).toHaveBeenCalledTimes(1);
    expect(addJuniorHandlerDogs).toHaveBeenCalledWith(['dog-1']);
  });

  it('adds nothing when no cart line is declared', () => {
    cartItems.splice(0, cartItems.length, row('dog-1', 'class-1', false));
    markWizardSessionOpen(SHOW, USER);
    render(<Harness />);
    expect(addJuniorHandlerDogs).not.toHaveBeenCalled();
  });

  it('ignores the PREVIOUS show cart and another exhibitor cart', () => {
    markWizardSessionOpen(SHOW, USER);
    cart.show_id = 'some-other-show';
    const { unmount } = render(<Harness />);
    expect(addJuniorHandlerDogs).not.toHaveBeenCalled();
    unmount();

    cart.show_id = SHOW;
    cart.exhibitor_id = 'someone-elses-profile';
    render(<Harness />);
    expect(addJuniorHandlerDogs).not.toHaveBeenCalled();
  });
});
