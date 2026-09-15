/**
 * MYK9-514: the one-shot cart reconcile must run against the RESTORED draft
 * selections, not the empty ones the wizard mounts with.
 *
 * `handleDraftLoaded` and the reconcile both call `setClassSelections`. Before
 * the fix they ran in the same commit, so the reconcile read the pre-rehydrate
 * (empty) selections, rebuilt them from the cart alone, and won the batch --
 * silently dropping every draft line the cart no longer carries plus each
 * line's jump height. The wizard's Back path merges cart rows IN and leaves a
 * selection with no cart row alone; this pins the same resolution here, which
 * is what MYK9-514's second acceptance criterion asks for.
 *
 * The trigger is a client-side entry into the wizard with the cart already
 * loaded -- Return to Cart then Continue Shopping. A document reload escapes it
 * only because the cart store does not persist `cart`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render } from '@testing-library/react';
import { useWizardDraftRehydration } from '../useWizardDraftRehydration';
import { markWizardSessionOpen } from '@/hooks/wizardDraftSession';
import type { DraftMetadata, SavedDraft } from '@/hooks/draftMetadata';
import type { ClassSelectionData } from '@/types/show-registration-types';
import type { RegistrationWizardState } from '../useRegistrationWizardState';
import type { createWizardHandlers } from '../wizardHandlers';

const SHOW = 'show-1';
const USER = 'user-1';
const PROFILE = 'profile-1';

// Mutable so the guard tests can point the global cart at the WRONG show or the
// wrong exhibitor without a second mock factory.
const cart = { show_id: SHOW as string | null, exhibitor_id: PROFILE as string | null };

function cartRow(classId: string) {
  return { id: `i-${classId}`, dog_id: 'dog-1', class_id: classId, class: { trial_id: 't1' } };
}

// Default: one row the draft already carries. The guard tests swap in a row the
// draft does NOT carry, so a guard that fails to fire is visible as an extra
// class rather than as a silent no-op.
const cartItems: ReturnType<typeof cartRow>[] = [cartRow('class-A')];

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
  stepCompleted: 'class-selection',
  title: 'Draft',
  preview: '1 dog',
  selectedDogsCount: 1,
  completed: false,
} as DraftMetadata;

const DRAFT_SELECTIONS: ClassSelectionData[] = [
  {
    dogId: 'dog-1',
    trialId: 't1',
    selectedClasses: [
      { classId: 'class-A', jumpHeight: '16', moveUpRequested: true },
      // Selected in the wizard, no cart row -- the Back path leaves it alone.
      { classId: 'class-B', jumpHeight: '16', moveUpRequested: false },
    ],
  },
];

const savedDraft = {
  metadata: meta,
  data: { selectedDogs: ['dog-1'] },
} as SavedDraft;

function Harness({ onSettled }: { onSettled: (s: ClassSelectionData[]) => void }) {
  // Stands in for the wizard's own `classSelections` state: empty on mount,
  // filled by `handleDraftLoaded`, then amended by the reconcile.
  const [classSelections, setClassSelections] = useState<ClassSelectionData[]>([]);
  const state = {
    showId: SHOW,
    userId: USER,
    isInsideSidebar: false,
    availableDrafts: [meta],
    draftLoad: () => savedDraft,
    currentStepId: 'payment',
    registrationData: { selectedDogs: [], entries: [], documents: [] },
    classSelections,
    exhibitorProfile: { id: PROFILE },
  } as unknown as RegistrationWizardState;
  const handlers = {
    handleDraftLoaded: () => {
      setClassSelections(DRAFT_SELECTIONS);
      return true;
    },
    handleClassSelectionChange: setClassSelections,
  } as unknown as ReturnType<typeof createWizardHandlers>;

  useWizardDraftRehydration(state, handlers);
  onSettled(classSelections);
  return null;
}

beforeEach(() => {
  sessionStorage.clear();
  cart.show_id = SHOW;
  cart.exhibitor_id = PROFILE;
  cartItems.splice(0, cartItems.length, cartRow('class-A'));
});

describe('useWizardDraftRehydration -- cart reconcile after a restore', () => {
  it('keeps the restored draft selections instead of rebuilding from the cart', () => {
    markWizardSessionOpen(SHOW, USER);
    let settled: ClassSelectionData[] = [];
    render(<Harness onSettled={s => (settled = s)} />);

    const dog = settled.find(s => s.dogId === 'dog-1');
    expect(dog, 'the restored dog survives the reconcile').toBeDefined();
    const byId = new Map(dog!.selectedClasses.map(c => [c.classId, c]));

    // The cart-less draft line is left alone, exactly as on Back.
    expect(byId.has('class-B')).toBe(true);
    // Per-class draft metadata is not reset to the reconcile's defaults.
    expect(byId.get('class-A')?.jumpHeight).toBe('16');
    expect(byId.get('class-A')?.moveUpRequested).toBe(true);
  });

  it('does not reconcile the PREVIOUS show\u2019s cart rows into this show', () => {
    // The cart store is global and still holds the last show while this show's
    // cart loads. Copying those rows in would add classes that belong to a
    // different show entirely \u2014 and burn the one-shot latch doing it.
    cart.show_id = 'some-other-show';
    // A class this draft has never heard of, so letting it through is visible.
    cartItems.splice(0, cartItems.length, cartRow('class-Z'));
    markWizardSessionOpen(SHOW, USER);
    let settled: ClassSelectionData[] = [];
    render(<Harness onSettled={s => (settled = s)} />);

    const dog = settled.find(s => s.dogId === 'dog-1');
    expect(dog, 'the draft still restores \u2014 only the reconcile is skipped').toBeDefined();
    expect(dog!.selectedClasses.map(c => c.classId)).toEqual(['class-A', 'class-B']);
  });

  it('does not reconcile a cart that belongs to a different exhibitor', () => {
    // A shared device, or a profile switch mid-sitting: the rows in the global
    // cart are somebody else's entries and must never join this draft.
    cart.exhibitor_id = 'someone-elses-profile';
    cartItems.splice(0, cartItems.length, cartRow('class-Z'));
    markWizardSessionOpen(SHOW, USER);
    let settled: ClassSelectionData[] = [];
    render(<Harness onSettled={s => (settled = s)} />);

    const dog = settled.find(s => s.dogId === 'dog-1');
    expect(dog).toBeDefined();
    expect(dog!.selectedClasses.map(c => c.classId)).toEqual(['class-A', 'class-B']);
  });
});
