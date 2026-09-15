/**
 * MYK9-514 x MYK9-519 — the draft beats `?dogId=`, including on the commit the
 * wizard mounts in.
 *
 * `RegistrationWizardPage` runs `useEntryDogHandoff` right after
 * `useRegistrationWizard`, so on a client-side entry with an already-warm
 * roster both hooks reach their effects in the SAME commit. The rehydrate
 * queues the draft's dogs there; the handoff, running later in that same
 * commit, still read `registrationData.selectedDogs` as `[]`, concluded no
 * draft had chosen anything, and replaced a whole restored entry with the one
 * dog the URL named — the `draft-wins` rule inverted at exactly the moment it
 * matters.
 *
 * Gating the handoff on the deferred rehydrate flag is what this pins.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Dog } from '@/types/dog-types';
import { markWizardSessionOpen } from '@/hooks/wizardDraftSession';
import type { DraftMetadata, SavedDraft } from '@/hooks/draftMetadata';
import { useWizardDraftRehydration } from '../useWizardDraftRehydration';
import { useEntryDogHandoff } from '../useEntryDogHandoff';
import type { RegistrationWizardState } from '../useRegistrationWizardState';
import type { createWizardHandlers } from '../wizardHandlers';

const SHOW = 'show-1';
const USER = 'user-1';
const PROFILE = 'profile-1';
/** The draft's dogs. */
const DRAFT_DOGS = ['dog-a', 'dog-b'];
/** The dog `?dogId=` carries — a different one. */
const CARRIED = 'dog-c';

const warning = vi.fn();
vi.mock('@/lib/notifications', () => ({
  notifications: { warning: (...args: unknown[]) => warning(...args) },
}));

// Empty cart: this test is about the dog step, and an empty cart short-circuits
// the reconcile effect before it can touch class selections.
vi.mock('@/store/cartStore', () => ({
  useCartItems: () => [],
  useCartStore: (selector: (s: unknown) => unknown) =>
    selector({ cart: { show_id: SHOW, exhibitor_id: PROFILE }, isLoading: false } as unknown),
}));

function makeDog(id: string): Dog {
  return {
    id,
    name: `Dog ${id}`,
    callName: id,
    breed: 'Border Collie',
    sex: 'female',
    ownerId: 'owner-1',
    status: 'active',
  } as Dog;
}

// Roster ready on the FIRST commit — the warm-store case, which is the only
// one where the two effects can collide.
const ROSTER = [...DRAFT_DOGS, CARRIED].map(makeDog);

const meta = {
  id: 'd1',
  showId: SHOW,
  userId: USER,
  timestamp: Date.now(),
  stepCompleted: 'class-selection',
  title: 'Draft',
  preview: '2 dogs',
  selectedDogsCount: DRAFT_DOGS.length,
  completed: false,
} as DraftMetadata;

const savedDraft = { metadata: meta, data: { selectedDogs: DRAFT_DOGS } } as SavedDraft;

function Harness({ onRender }: { onRender: (dogs: string[]) => void }) {
  const [selectedDogs, setSelectedDogs] = useState<string[]>([]);
  const registrationData = { selectedDogs, entries: [], documents: [] };

  const state = {
    showId: SHOW,
    userId: USER,
    isInsideSidebar: false,
    availableDrafts: [meta],
    draftLoad: () => savedDraft,
    currentStepId: 'class-selection',
    registrationData,
    classSelections: [],
    exhibitorProfile: { id: PROFILE },
  } as unknown as RegistrationWizardState;

  const handlers = {
    // Stands in for the real handler: restores the draft's dogs into state.
    handleDraftLoaded: () => {
      setSelectedDogs(DRAFT_DOGS);
      return true;
    },
    handleClassSelectionChange: () => {},
  } as unknown as ReturnType<typeof createWizardHandlers>;

  const { rehydrationSettled } = useWizardDraftRehydration(state, handlers);

  // Same call order as RegistrationWizardPage.
  useEntryDogHandoff({
    dogs: ROSTER,
    dogsReady: true,
    registrationData,
    currentWorkflowMode: 'exhibitor',
    rehydrationSettled,
    currentWorkflowConfig: { steps: ['dog-selection', 'class-selection'] },
    entryCloseAvailability: { canEnter: true },
    handleDogSelectionChange: setSelectedDogs,
  });

  onRender(selectedDogs);
  return null;
}

beforeEach(() => {
  warning.mockClear();
  sessionStorage.clear();
});

describe('wizard rehydrate vs. the ?dogId= handoff', () => {
  it('keeps the restored draft dogs instead of the single carried dog', () => {
    markWizardSessionOpen(SHOW, USER);
    let settled: string[] = [];
    render(
      <MemoryRouter initialEntries={[`/shows/${SHOW}/register?dogId=${CARRIED}`]}>
        <Harness onRender={dogs => (settled = dogs)} />
      </MemoryRouter>
    );

    expect(settled, 'the draft wins over the URL hint').toEqual(DRAFT_DOGS);
    expect(settled).not.toContain(CARRIED);
    // `draft-wins` is a silent outcome — nothing failed, so nothing to explain.
    expect(warning).not.toHaveBeenCalled();
  });

  it('still honours the carried dog when there is no draft to restore', () => {
    // No same-tab marker: rehydration settles as `skipped` and the handoff runs.
    let settled: string[] = [];
    render(
      <MemoryRouter initialEntries={[`/shows/${SHOW}/register?dogId=${CARRIED}`]}>
        <Harness onRender={dogs => (settled = dogs)} />
      </MemoryRouter>
    );

    expect(settled).toEqual([CARRIED]);
    expect(warning).not.toHaveBeenCalled();
  });
});
