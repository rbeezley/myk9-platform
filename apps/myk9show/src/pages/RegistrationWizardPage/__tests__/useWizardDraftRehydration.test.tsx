/**
 * MYK9-514: the wizard restores its own draft on a same-tab return, and only
 * on a same-tab return.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useWizardDraftRehydration } from '../useWizardDraftRehydration';
import { markWizardSessionOpen, hasWizardSession } from '@/hooks/wizardDraftSession';
import type { DraftMetadata, SavedDraft } from '@/hooks/draftMetadata';
import type { RegistrationWizardState } from '../useRegistrationWizardState';
import type { createWizardHandlers } from '../wizardHandlers';

vi.mock('@/store/cartStore', () => ({
  useCartItems: () => [],
  useCartStore: (selector: (s: unknown) => unknown) =>
    selector({ cart: null, isLoading: false } as unknown),
}));

const SHOW = 'show-1';
const USER = 'user-1';

const metadata = (over: Partial<DraftMetadata> = {}): DraftMetadata => ({
  id: 'd1',
  showId: SHOW,
  userId: USER,
  timestamp: Date.now(),
  stepCompleted: 'class-selection',
  title: 'Draft',
  preview: '1 dog',
  selectedDogsCount: 1,
  completed: false,
  ...over,
});

const savedDraft: SavedDraft = {
  metadata: metadata(),
  data: { selectedDogs: ['dog-1'] },
};

interface Harness {
  state: RegistrationWizardState;
  handlers: ReturnType<typeof createWizardHandlers>;
  handleDraftLoaded: ReturnType<typeof vi.fn>;
  draftLoad: ReturnType<typeof vi.fn>;
}

function harness(over: Partial<Record<string, unknown>> = {}): Harness {
  const handleDraftLoaded = vi.fn(() => true);
  const draftLoad = vi.fn(() => savedDraft);
  const state = {
    showId: SHOW,
    userId: USER,
    isInsideSidebar: false,
    availableDrafts: [metadata()],
    draftLoad,
    currentStepId: 'dog-selection',
    registrationData: { selectedDogs: [], entries: [], documents: [] },
    classSelections: [],
    exhibitorProfile: { id: 'profile-1' },
    ...over,
  } as unknown as RegistrationWizardState;
  const handlers = {
    handleDraftLoaded,
    handleClassSelectionChange: vi.fn(),
  } as unknown as ReturnType<typeof createWizardHandlers>;
  return { state, handlers, handleDraftLoaded, draftLoad };
}

describe('useWizardDraftRehydration', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('restores the saved draft when this tab was already mid-entry', () => {
    markWizardSessionOpen(SHOW, USER);
    const h = harness();
    renderHook(() => useWizardDraftRehydration(h.state, h.handlers));
    expect(h.draftLoad).toHaveBeenCalledWith('d1');
    // Silent: the exhibitor reloaded, they did not choose to load a draft.
    expect(h.handleDraftLoaded).toHaveBeenCalledWith(savedDraft, { silent: true });
  });

  it('restores nothing on a fresh visit — that is the Resume panel’s job', () => {
    const h = harness();
    renderHook(() => useWizardDraftRehydration(h.state, h.handlers));
    expect(h.handleDraftLoaded).not.toHaveBeenCalled();
  });

  it('never restores another exhibitor’s sitting on the same device', () => {
    markWizardSessionOpen(SHOW, 'someone-else');
    const h = harness();
    renderHook(() => useWizardDraftRehydration(h.state, h.handlers));
    expect(h.handleDraftLoaded).not.toHaveBeenCalled();
  });

  it('leaves live state alone — a route change is not a reload', () => {
    markWizardSessionOpen(SHOW, USER);
    const h = harness({
      registrationData: { selectedDogs: ['dog-9'], entries: [], documents: [] },
    });
    renderHook(() => useWizardDraftRehydration(h.state, h.handlers));
    expect(h.handleDraftLoaded).not.toHaveBeenCalled();
  });

  it('does not auto-restore on the staff on-behalf surfaces', () => {
    markWizardSessionOpen(SHOW, USER);
    const h = harness({ isInsideSidebar: true });
    renderHook(() => useWizardDraftRehydration(h.state, h.handlers));
    expect(h.handleDraftLoaded).not.toHaveBeenCalled();
  });

  it('marks the tab once there is a selection worth coming back to', () => {
    const h = harness({
      registrationData: { selectedDogs: ['dog-1'], entries: [], documents: [] },
    });
    renderHook(() => useWizardDraftRehydration(h.state, h.handlers));
    expect(hasWizardSession(SHOW, USER)).toBe(true);
  });

  it('retires the marker once the entry is confirmed', () => {
    markWizardSessionOpen(SHOW, USER);
    const h = harness({
      currentStepId: 'confirmation',
      registrationData: { selectedDogs: ['dog-1'], entries: [], documents: [] },
    });
    renderHook(() => useWizardDraftRehydration(h.state, h.handlers));
    expect(hasWizardSession(SHOW, USER)).toBe(false);
  });
});
