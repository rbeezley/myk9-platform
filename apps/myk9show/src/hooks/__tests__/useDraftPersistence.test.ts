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
});
