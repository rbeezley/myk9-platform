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
      const loaded = result.current.loadDraft(draftId!);
      if (loaded) result.current.activateDraft(loaded);
      result.current.autoSave();
    });

    expect(result.current.availableDrafts).toHaveLength(1);
    expect(result.current.availableDrafts[0]?.id).toBe(draftId);
  });

  it('does not overwrite a read but rejected draft when an empty page exits', () => {
    seedDraftData({ selectedDogs: ['dog-1'] });
    const { result: writer, unmount } = renderHook(() =>
      useDraftPersistence(SHOW_ID, USER_A, 'dog-selection')
    );
    let draftId: string | null = null;
    act(() => {
      draftId = writer.current.saveDraft('Saved dog');
    });
    unmount();

    seedDraftData({ selectedDogs: [] });
    const { result: reader } = renderHook(() =>
      useDraftPersistence(SHOW_ID, USER_A, 'dog-selection')
    );
    act(() => {
      reader.current.loadDraft(draftId!);
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(reader.current.loadDraft(draftId!)?.data.selectedDogs).toEqual(['dog-1']);
  });

  it('refreshes metadata when autosaving an existing draft', () => {
    seedDraftData({ selectedDogs: [] });
    let step = 'dog-selection';
    const { result, rerender } = renderHook(() => useDraftPersistence(SHOW_ID, USER_A, step));
    act(() => {
      result.current.saveDraft('Empty manual draft');
    });
    expect(result.current.availableDrafts[0]?.selectedDogsCount).toBe(0);

    seedDraftData({ selectedDogs: ['dog-1'] });
    step = 'class-selection';
    rerender();
    act(() => {
      result.current.autoSave();
    });

    expect(result.current.availableDrafts[0]?.preview).toBe('1 dog');
    expect(result.current.availableDrafts[0]?.selectedDogsCount).toBe(1);
    expect(result.current.availableDrafts[0]?.stepCompleted).toBe('class-selection');
  });

  it('saves a selection when browser navigation hides the page before the timer fires', () => {
    seedDraftData({ selectedDogs: ['dog-1'] });
    const { result } = renderHook(() => useDraftPersistence(SHOW_ID, USER_A, 'dog-selection'));

    expect(result.current.availableDrafts).toHaveLength(0);
    act(() => window.dispatchEvent(new Event('pagehide')));

    expect(result.current.availableDrafts[0]?.selectedDogsCount).toBe(1);
  });

  it('does not create empty autosaves that evict a meaningful draft', () => {
    seedDraftData({ selectedDogs: ['dog-1'] });
    const { result: saved, unmount: unmountSaved } = renderHook(() =>
      useDraftPersistence(SHOW_ID, USER_A, 'dog-selection')
    );
    act(() => saved.current.autoSave());
    const savedId = saved.current.availableDrafts[0]?.id;
    unmountSaved();

    seedDraftData({ selectedDogs: [] });
    for (let visit = 0; visit < 6; visit++) {
      const { result, unmount } = renderHook(() =>
        useDraftPersistence(SHOW_ID, USER_A, 'dog-selection')
      );
      act(() => window.dispatchEvent(new Event('pagehide')));
      unmount();
      expect(result.current.availableDrafts[0]?.id).toBe(savedId);
    }
  });

  it('recognizes a completed entry from the saved payload, not stale metadata', () => {
    seedDraftData({ selectedDogs: ['dog-1'], _workflowState: { currentStep: 'confirmation' } });
    const { result } = renderHook(() => useDraftPersistence(SHOW_ID, USER_A, 'dog-selection'));
    act(() => result.current.saveDraft('Filed entry'));

    expect(result.current.availableDrafts[0]?.stepCompleted).toBe('dog-selection');
    expect(result.current.availableDrafts[0]?.completed).toBe(true);
  });

  it('refreshes another hook instance in the same document after a save', () => {
    seedDraftData({ selectedDogs: ['dog-1'] });
    const { result: reader } = renderHook(() =>
      useDraftPersistence(SHOW_ID, USER_A, 'dog-selection')
    );
    const { result: writer } = renderHook(() =>
      useDraftPersistence(SHOW_ID, USER_A, 'dog-selection')
    );

    act(() => writer.current.saveDraft('Saved elsewhere'));
    expect(reader.current.availableDrafts[0]?.selectedDogsCount).toBe(1);
  });

  it('refreshes its memoized draft list when another tab changes metadata', () => {
    const { result: reader } = renderHook(() =>
      useDraftPersistence(SHOW_ID, USER_A, 'dog-selection')
    );
    const metadata = {
      id: 'other-tab-draft',
      showId: SHOW_ID,
      userId: USER_A,
      timestamp: Date.now(),
      stepCompleted: 'dog-selection',
      title: 'Other tab',
      preview: '1 dog',
    };
    localStorage.setItem(
      `registration-draft-${SHOW_ID}-${USER_A}-${metadata.id}`,
      JSON.stringify({ metadata, data: { selectedDogs: ['dog-1'] } })
    );
    localStorage.setItem(
      `registration-draft-metadata-${SHOW_ID}-${USER_A}`,
      JSON.stringify([metadata])
    );
    expect(reader.current.availableDrafts).toHaveLength(0);

    act(() =>
      window.dispatchEvent(
        new StorageEvent('storage', { key: `registration-draft-metadata-${SHOW_ID}-${USER_A}` })
      )
    );
    expect(reader.current.availableDrafts[0]?.selectedDogsCount).toBe(1);
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

  it('discards filed-dog drafts, preserves another dog, and blocks later saves', () => {
    seedDraftData({ selectedDogs: ['dog-1'] });
    const metadataKey = `registration-draft-metadata-${SHOW_ID}-${USER_A}`;
    const { result, unmount, rerender } = renderHook(() =>
      useDraftPersistence(SHOW_ID, USER_A, 'dog-selection')
    );

    act(() => {
      result.current.saveDraft('First draft');
      result.current.saveDraft('Second draft');
    });
    expect(JSON.parse(localStorage.getItem(metadataKey) ?? '[]')).toHaveLength(2);

    seedDraftData({ selectedDogs: ['dog-2'] });
    rerender();
    let unrelatedId: string | null = null;
    act(() => {
      unrelatedId = result.current.saveDraft('Different dog');
    });
    seedDraftData({ selectedDogs: ['dog-1'] });
    rerender();

    act(() => {
      result.current.discardDraftsWithoutFinalSave();
    });
    expect(result.current.availableDrafts.map(draft => draft.id)).toEqual([unrelatedId]);

    seedDraftData({ selectedDogs: ['dog-2'] });
    rerender();
    act(() => {
      result.current.autoSave();
      expect(result.current.saveDraft('Filed entry')).toBeNull();
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(result.current.hasUnsavedChanges).toBe(false);
    expect(result.current.availableDrafts.map(draft => draft.id)).toEqual([unrelatedId]);

    unmount();

    expect(result.current.availableDrafts.map(draft => draft.id)).toEqual([unrelatedId]);
  });
});
