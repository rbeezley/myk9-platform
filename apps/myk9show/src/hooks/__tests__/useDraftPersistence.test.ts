/**
 * Tests for useDraftPersistence cross-user scoping.
 *
 * Covers the shared-device leak fixed during the 2026-04-23 entries-wizard
 * harden: storage keys must include the userId so that one user's
 * `maxDraftsPerShow` trim or `clearAllDrafts` cannot evict another user's
 * drafts, and loadDraft must refuse drafts whose payload userId doesn't match.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDraftPersistence } from '../useDraftPersistence';
import { useShowRegistrationStore } from '@/store/showRegistrationStore';

vi.mock('@/services/LoggingService', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const SHOW_ID = 'show-1';
const USER_A = 'user-a';
const USER_B = 'user-b';

function seedDraftData(data: Record<string, unknown>) {
  useShowRegistrationStore.getState().setDraftData(data);
}

describe('useDraftPersistence — cross-user scoping', () => {
  beforeEach(() => {
    localStorage.clear();
    useShowRegistrationStore.getState().clearDraftData();
  });

  it('user B sees zero drafts after user A has saved one for the same show', () => {
    // User A saves a draft
    seedDraftData({ selectedDogs: ['dog-1'] });
    const { result: aResult } = renderHook(() =>
      useDraftPersistence(SHOW_ID, USER_A, 'dog-selection')
    );
    act(() => {
      aResult.current.saveDraft('User A draft');
    });
    // Re-render A to pick up the freshly saved metadata
    const { result: aAfter } = renderHook(() =>
      useDraftPersistence(SHOW_ID, USER_A, 'dog-selection')
    );
    expect(aAfter.current.availableDrafts.length).toBe(1);

    // User B viewing the same show sees none of A's drafts
    const { result: bResult } = renderHook(() =>
      useDraftPersistence(SHOW_ID, USER_B, 'dog-selection')
    );
    expect(bResult.current.availableDrafts.length).toBe(0);
  });

  it("user B's save does not evict user A's drafts via the maxDraftsPerShow trim", () => {
    // Seed 5 (the default cap) drafts for user A
    seedDraftData({ selectedDogs: ['dog-1'] });
    const { result: aHook } = renderHook(() =>
      useDraftPersistence(SHOW_ID, USER_A, 'dog-selection')
    );
    act(() => {
      for (let i = 0; i < 5; i++) aHook.current.saveDraft(`A draft ${i}`);
    });

    // User B floods 10 saves on the same show
    const { result: bHook } = renderHook(() =>
      useDraftPersistence(SHOW_ID, USER_B, 'dog-selection')
    );
    act(() => {
      for (let i = 0; i < 10; i++) bHook.current.saveDraft(`B draft ${i}`);
    });

    // Re-read A — all five of A's drafts must still be present
    const { result: aAfter } = renderHook(() =>
      useDraftPersistence(SHOW_ID, USER_A, 'dog-selection')
    );
    expect(aAfter.current.availableDrafts.length).toBe(5);
    // And B is also capped at 5 (their own bucket)
    const { result: bAfter } = renderHook(() =>
      useDraftPersistence(SHOW_ID, USER_B, 'dog-selection')
    );
    expect(bAfter.current.availableDrafts.length).toBe(5);
  });

  it('saveDraft is a no-op when userId is empty', () => {
    seedDraftData({ selectedDogs: ['dog-1'] });
    const { result } = renderHook(() => useDraftPersistence(SHOW_ID, '', 'dog-selection'));
    let savedId: string | null = null;
    act(() => {
      savedId = result.current.saveDraft('Anon draft');
    });
    expect(savedId).toBeNull();
    // No metadata key written
    expect(localStorage.getItem(`registration-draft-metadata-${SHOW_ID}-`)).toBeNull();
  });

  it("loadDraft refuses a payload whose metadata.userId doesn't match the current user", () => {
    // Manually plant a draft under user B's key but with user A's userId in the
    // payload (simulates a copied or legacy draft).
    const draftId = 'manual-1';
    const draftKey = `registration-draft-${SHOW_ID}-${USER_B}-${draftId}`;
    localStorage.setItem(
      draftKey,
      JSON.stringify({
        metadata: {
          id: draftId,
          showId: SHOW_ID,
          userId: USER_A,
          timestamp: Date.now(),
          stepCompleted: 'dog-selection',
          title: 'Copied',
          preview: '1 dog',
        },
        data: { selectedDogs: ['dog-1'] },
      })
    );

    const { result } = renderHook(() => useDraftPersistence(SHOW_ID, USER_B, 'dog-selection'));
    const loaded = result.current.loadDraft(draftId);
    expect(loaded).toBeNull();
  });

  it('updates the loaded draft instead of creating another autosave draft', () => {
    seedDraftData({ selectedDogs: ['dog-1'] });
    const { result } = renderHook(() => useDraftPersistence(SHOW_ID, USER_A, 'dog-selection'));

    let draftId: string | null = null;
    act(() => {
      draftId = result.current.saveDraft('Saved draft');
    });
    expect(draftId).not.toBeNull();

    act(() => {
      result.current.loadDraft(draftId!);
      result.current.autoSave();
    });

    expect(result.current.availableDrafts).toHaveLength(1);
    expect(result.current.availableDrafts[0]?.id).toBe(draftId);
  });

  it('does not recreate a draft from unchanged form state after clearing all drafts', () => {
    seedDraftData({ selectedDogs: ['dog-1'] });
    const { result, rerender } = renderHook(() =>
      useDraftPersistence(SHOW_ID, USER_A, 'dog-selection')
    );

    act(() => {
      result.current.autoSave();
    });
    expect(result.current.availableDrafts).toHaveLength(1);

    seedDraftData({ selectedDogs: ['dog-2'] });
    rerender();
    act(() => {
      result.current.clearAllDrafts();
      result.current.autoSave();
    });

    expect(result.current.availableDrafts).toHaveLength(0);
  });

  it('discardDraftsWithoutFinalSave clears drafts and skips the unmount auto-save', () => {
    seedDraftData({
      selectedDogs: ['dog-1'],
      _workflowState: {
        classSelections: [
          { dogId: 'dog-1', trialId: 'trial-1', selectedClasses: [{ classId: 'class-1' }] },
        ],
      },
    });
    const metadataKey = `registration-draft-metadata-${SHOW_ID}-${USER_A}`;
    const { result, unmount } = renderHook(() =>
      useDraftPersistence(SHOW_ID, USER_A, 'dog-selection')
    );

    act(() => {
      result.current.saveDraft('Draft to discard');
    });
    expect(JSON.parse(localStorage.getItem(metadataKey) ?? '[]')).toHaveLength(1);

    act(() => {
      result.current.discardDraftsWithoutFinalSave([{ dogId: 'dog-1', classId: 'class-1' }]);
    });
    expect(localStorage.getItem(metadataKey)).toBeNull();

    unmount();

    expect(localStorage.getItem(metadataKey)).toBeNull();
  });

  it('saves the selected dog on pagehide before the autosave interval', () => {
    seedDraftData({ selectedDogs: ['dog-1'], _workflowState: { currentStep: 'class-selection' } });
    const { result } = renderHook(() => useDraftPersistence(SHOW_ID, USER_A, 'class-selection'));

    act(() => window.dispatchEvent(new Event('pagehide')));

    expect(result.current.availableDrafts).toHaveLength(1);
    expect(result.current.availableDrafts[0]).toMatchObject({
      selectedDogsCount: 1,
      completed: false,
    });
  });

  it('does not let an empty reentry evict a saved entry', () => {
    seedDraftData({ selectedDogs: ['dog-1'] });
    const first = renderHook(() => useDraftPersistence(SHOW_ID, USER_A, 'dog-selection'));
    act(() => first.result.current.autoSave());
    const savedId = first.result.current.availableDrafts[0]?.id;
    first.unmount();

    seedDraftData({ selectedDogs: [], _workflowState: { currentStep: 'dog-selection' } });
    const second = renderHook(() => useDraftPersistence(SHOW_ID, USER_A, 'dog-selection'));
    act(() => {
      second.result.current.autoSave();
      window.dispatchEvent(new Event('pagehide'));
    });

    expect(second.result.current.availableDrafts.map(draft => draft.id)).toEqual([savedId]);
    expect(second.result.current.availableDrafts[0]?.selectedDogsCount).toBe(1);
  });

  it('does not activate a rejected read or overwrite its saved payload', () => {
    seedDraftData({ selectedDogs: ['dog-1'] });
    const first = renderHook(() => useDraftPersistence(SHOW_ID, USER_A, 'dog-selection'));
    let savedId: string | null = null;
    act(() => {
      savedId = first.result.current.saveDraft('Entry to resume');
    });
    first.unmount();

    seedDraftData({ selectedDogs: [], _workflowState: { currentStep: 'dog-selection' } });
    const second = renderHook(() => useDraftPersistence(SHOW_ID, USER_A, 'dog-selection'));
    expect(second.result.current.loadDraft(savedId!)?.data.selectedDogs).toEqual(['dog-1']);
    act(() => second.result.current.autoSave());
    expect(second.result.current.loadDraft(savedId!)?.data.selectedDogs).toEqual(['dog-1']);
  });

  it('does not overwrite an accepted draft before the restored form reaches the hook', () => {
    seedDraftData({ selectedDogs: ['dog-1'] });
    const first = renderHook(() => useDraftPersistence(SHOW_ID, USER_A, 'dog-selection'));
    let savedId: string | null = null;
    act(() => {
      savedId = first.result.current.saveDraft('Entry to resume');
    });
    first.unmount();

    seedDraftData({ selectedDogs: [], _workflowState: { currentStep: 'dog-selection' } });
    const second = renderHook(() => useDraftPersistence(SHOW_ID, USER_A, 'dog-selection'));
    act(() => {
      second.result.current.activateDraft(second.result.current.loadDraft(savedId!)!);
      second.result.current.autoSave();
    });

    expect(second.result.current.loadDraft(savedId!)?.data.selectedDogs).toEqual(['dog-1']);
  });

  it('autosaves a changed selection before the first timer tick after resume', () => {
    seedDraftData({ selectedDogs: ['dog-1'] });
    const first = renderHook(() => useDraftPersistence(SHOW_ID, USER_A, 'dog-selection'));
    let savedId: string | null = null;
    act(() => {
      savedId = first.result.current.saveDraft('Entry to resume');
    });
    first.unmount();

    seedDraftData({ selectedDogs: [] });
    const second = renderHook(() => useDraftPersistence(SHOW_ID, USER_A, 'dog-selection'));
    act(() => second.result.current.activateDraft(second.result.current.loadDraft(savedId!)!));
    seedDraftData({ selectedDogs: ['dog-2'] });
    second.rerender();
    act(() => window.dispatchEvent(new Event('pagehide')));

    expect(second.result.current.loadDraft(savedId!)?.data.selectedDogs).toEqual(['dog-2']);
  });

  it('keeps unrelated saved drafts when only one dog is handed off', () => {
    seedDraftData({
      selectedDogs: ['dog-1'],
      _workflowState: {
        classSelections: [
          { dogId: 'dog-1', trialId: 'trial-1', selectedClasses: [{ classId: 'class-1' }] },
        ],
      },
    });
    const { result, rerender } = renderHook(() =>
      useDraftPersistence(SHOW_ID, USER_A, 'dog-selection')
    );
    act(() => result.current.saveDraft('Dog one'));
    seedDraftData({
      selectedDogs: ['dog-2'],
      _workflowState: {
        classSelections: [
          { dogId: 'dog-2', trialId: 'trial-1', selectedClasses: [{ classId: 'class-2' }] },
        ],
      },
    });
    rerender();
    act(() => result.current.saveDraft('Dog two'));

    act(() =>
      result.current.discardDraftsWithoutFinalSave([{ dogId: 'dog-1', classId: 'class-1' }])
    );

    expect(result.current.availableDrafts.map(draft => draft.title)).toEqual(['Dog two']);
    expect(
      result.current.loadDraft(result.current.availableDrafts[0]!.id)?.data.selectedDogs
    ).toEqual(['dog-2']);
  });

  it('retains unfiled dog work inside a mixed draft', () => {
    seedDraftData({
      selectedDogs: ['dog-1', 'dog-2'],
      _workflowState: {
        currentStep: 'payment',
        stepCompletionState: { 'dog-selection': true },
        classSelections: [
          { dogId: 'dog-1', trialId: 'trial-1', selectedClasses: [{ classId: 'class-1' }] },
          { dogId: 'dog-2', trialId: 'trial-1', selectedClasses: [{ classId: 'class-2' }] },
        ],
        handlerAssignments: {},
        paymentStatus: 'pending',
        entryStatus: 'pending',
      },
    });
    const { result } = renderHook(() => useDraftPersistence(SHOW_ID, USER_A, 'payment'));
    let draftId: string | null = null;
    act(() => {
      draftId = result.current.saveDraft('Two dogs');
      result.current.discardDraftsWithoutFinalSave([{ dogId: 'dog-1', classId: 'class-1' }]);
    });

    expect(result.current.availableDrafts).toHaveLength(1);
    expect(result.current.availableDrafts[0]).toMatchObject({
      id: draftId,
      selectedDogsCount: 1,
    });
    expect(result.current.loadDraft(draftId!)?.data).toMatchObject({
      selectedDogs: ['dog-2'],
      _workflowState: {
        currentStep: 'dog-selection',
        classSelections: [
          { dogId: 'dog-2', trialId: 'trial-1', selectedClasses: [{ classId: 'class-2' }] },
        ],
      },
    });
  });

  it('keeps a denied class for the same dog after another class is filed', () => {
    seedDraftData({
      selectedDogs: ['dog-1'],
      _workflowState: {
        currentStep: 'payment',
        stepCompletionState: {},
        classSelections: [
          {
            dogId: 'dog-1',
            trialId: 'trial-1',
            selectedClasses: [{ classId: 'class-1' }, { classId: 'class-2' }],
          },
        ],
        handlerAssignments: {},
        paymentStatus: 'pending',
        entryStatus: 'pending',
      },
    });
    const { result } = renderHook(() => useDraftPersistence(SHOW_ID, USER_A, 'payment'));
    let draftId: string | null = null;
    act(() => {
      draftId = result.current.saveDraft('Two classes');
      result.current.discardDraftsWithoutFinalSave([{ dogId: 'dog-1', classId: 'class-1' }]);
    });

    expect(result.current.loadDraft(draftId!)?.data).toMatchObject({
      selectedDogs: ['dog-1'],
      _workflowState: {
        currentStep: 'dog-selection',
        classSelections: [{ dogId: 'dog-1', selectedClasses: [{ classId: 'class-2' }] }],
      },
    });
  });

  it('removes a stale pre-class draft for a dog whose class was filed', () => {
    seedDraftData({
      selectedDogs: ['dog-1'],
      _workflowState: { currentStep: 'dog-selection', classSelections: [] },
    });
    const { result } = renderHook(() => useDraftPersistence(SHOW_ID, USER_A, 'dog-selection'));
    let draftId: string | null = null;
    act(() => {
      draftId = result.current.saveDraft('Before classes');
      result.current.discardDraftsWithoutFinalSave([{ dogId: 'dog-1', classId: 'class-1' }]);
    });

    expect(result.current.availableDrafts).toHaveLength(0);
    expect(localStorage.getItem(`registration-draft-${SHOW_ID}-${USER_A}-${draftId}`)).toBeNull();
  });

  it('continues saving only denied work after a partial submission', () => {
    const workflow = {
      currentStep: 'payment',
      stepCompletionState: {},
      classSelections: [
        { dogId: 'dog-1', trialId: 'trial-1', selectedClasses: [{ classId: 'class-1' }] },
        { dogId: 'dog-2', trialId: 'trial-1', selectedClasses: [{ classId: 'class-2' }] },
      ],
      handlerAssignments: {},
      paymentStatus: 'pending',
      entryStatus: 'pending',
    };
    seedDraftData({ selectedDogs: ['dog-1', 'dog-2'], _workflowState: workflow });
    const { result, rerender } = renderHook(() => useDraftPersistence(SHOW_ID, USER_A, 'payment'));
    let draftId: string | null = null;
    act(() => {
      draftId = result.current.saveDraft('Partial entry');
      result.current.discardDraftsWithoutFinalSave([{ dogId: 'dog-1', classId: 'class-1' }]);
    });

    seedDraftData({
      selectedDogs: ['dog-1', 'dog-2'],
      _workflowState: {
        ...workflow,
        currentStep: 'class-selection',
        classSelections: [
          workflow.classSelections[0],
          {
            dogId: 'dog-2',
            trialId: 'trial-1',
            selectedClasses: [{ classId: 'class-2' }, { classId: 'class-3' }],
          },
        ],
      },
    });
    rerender();
    act(() => window.dispatchEvent(new Event('pagehide')));

    expect(result.current.loadDraft(draftId!)?.data).toMatchObject({
      selectedDogs: ['dog-2'],
      _workflowState: {
        classSelections: [
          {
            dogId: 'dog-2',
            selectedClasses: [{ classId: 'class-2' }, { classId: 'class-3' }],
          },
        ],
      },
    });
    expect(result.current.availableDrafts).toHaveLength(1);
  });

  it('refuses a manual Save Draft on the receipt after filing', () => {
    seedDraftData({
      selectedDogs: ['dog-1'],
      _workflowState: {
        currentStep: 'payment',
        classSelections: [
          { dogId: 'dog-1', trialId: 'trial-1', selectedClasses: [{ classId: 'class-1' }] },
        ],
      },
    });
    const { result, rerender } = renderHook(() => useDraftPersistence(SHOW_ID, USER_A, 'payment'));
    act(() =>
      result.current.discardDraftsWithoutFinalSave([{ dogId: 'dog-1', classId: 'class-1' }])
    );
    seedDraftData({
      selectedDogs: ['dog-1'],
      _workflowState: { currentStep: 'confirmation', classSelections: [] },
    });
    rerender();

    expect(result.current.saveDraft('Already filed')).toBeNull();
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(result.current.availableDrafts).toHaveLength(0);
  });

  it('does not reread draft payloads on an unrelated wizard rerender', () => {
    seedDraftData({ selectedDogs: ['dog-1'] });
    const first = renderHook(() => useDraftPersistence(SHOW_ID, USER_A, 'dog-selection'));
    act(() => first.result.current.saveDraft('Saved entry'));
    first.unmount();

    const read = vi.spyOn(Storage.prototype, 'getItem');
    const second = renderHook(() => useDraftPersistence(SHOW_ID, USER_A, 'dog-selection'));
    const payloadKey = `registration-draft-${SHOW_ID}-${USER_A}-${second.result.current.availableDrafts[0]!.id}`;
    const readsBefore = read.mock.calls.filter(([key]) => key === payloadKey).length;
    second.rerender();

    expect(read.mock.calls.filter(([key]) => key === payloadKey)).toHaveLength(readsBefore);
    read.mockRestore();
  });

  it('updates the accepted draft and derives resume eligibility from its payload', () => {
    seedDraftData({ selectedDogs: ['dog-1'] });
    const { result, rerender } = renderHook(() =>
      useDraftPersistence(SHOW_ID, USER_A, 'dog-selection')
    );
    let savedId: string | null = null;
    act(() => {
      savedId = result.current.saveDraft('Entry to resume');
      result.current.activateDraft(result.current.loadDraft(savedId!)!);
    });

    // The first render after activation has the restored selection. An earlier
    // empty render must not overwrite it while React applies the loaded state.
    rerender();
    act(() => result.current.autoSave());

    seedDraftData({
      selectedDogs: ['dog-1', 'dog-2'],
      _workflowState: { currentStep: 'confirmation' },
    });
    rerender();
    act(() => result.current.autoSave());

    expect(result.current.availableDrafts).toHaveLength(1);
    expect(result.current.availableDrafts[0]).toMatchObject({
      id: savedId,
      selectedDogsCount: 2,
      completed: true,
    });
  });
});
