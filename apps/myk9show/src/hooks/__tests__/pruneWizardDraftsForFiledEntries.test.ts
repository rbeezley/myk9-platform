import { describe, it, expect, beforeEach } from 'vitest';
import { pruneWizardDraftsForFiledEntries } from '../pruneWizardDraftsForFiledEntries';
import { DRAFT_STORAGE_KEY_PREFIX, draftKey, draftMetadataKey } from '../draftStorageKeys';
import { markWizardSessionOpen, hasWizardSession } from '../wizardDraftSession';
import type { SavedDraft } from '../draftMetadata';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';

const SHOW = 'show-1';
const USER = 'user-1';

function writeDraft(id: string, dogs: string[], pairs: Array<[string, string]>): SavedDraft {
  const saved: SavedDraft = {
    metadata: {
      id,
      showId: SHOW,
      userId: USER,
      timestamp: 1000,
      stepCompleted: 'payment',
      title: 'Draft',
      preview: `${dogs.length} dogs`,
    },
    data: {
      selectedDogs: dogs,
      _workflowState: {
        currentStep: 'payment',
        stepCompletionState: {},
        classSelections: dogs.map(dogId => ({
          dogId,
          trialId: 'trial-1',
          selectedClasses: pairs
            .filter(([d]) => d === dogId)
            .map(([, classId]) => ({ classId, jumpHeight: undefined })),
        })),
        handlerAssignments: {},
        paymentStatus: PaymentStatus.PENDING,
        entryStatus: EntryStatus.PENDING,
      },
    },
  };
  localStorage.setItem(draftKey(DRAFT_STORAGE_KEY_PREFIX, SHOW, USER, id), JSON.stringify(saved));
  return saved;
}

function metadataList(): Array<{ id: string }> {
  const raw = localStorage.getItem(draftMetadataKey(DRAFT_STORAGE_KEY_PREFIX, SHOW, USER));
  return raw ? JSON.parse(raw) : [];
}

describe('pruneWizardDraftsForFiledEntries', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('does nothing when no entries were filed', () => {
    const saved = writeDraft('d1', ['dog-1'], [['dog-1', 'class-1']]);
    localStorage.setItem(
      draftMetadataKey(DRAFT_STORAGE_KEY_PREFIX, SHOW, USER),
      JSON.stringify([saved.metadata])
    );
    pruneWizardDraftsForFiledEntries({ showId: SHOW, userId: USER, filed: [] });
    expect(metadataList()).toHaveLength(1);
  });

  it('removes a draft whose every line was filed, and retires the tab marker', () => {
    const saved = writeDraft('d1', ['dog-1'], [['dog-1', 'class-1']]);
    localStorage.setItem(
      draftMetadataKey(DRAFT_STORAGE_KEY_PREFIX, SHOW, USER),
      JSON.stringify([saved.metadata])
    );
    markWizardSessionOpen(SHOW, USER);

    pruneWizardDraftsForFiledEntries({
      showId: SHOW,
      userId: USER,
      filed: [{ dogId: 'dog-1', classId: 'class-1' }],
    });

    expect(metadataList()).toHaveLength(0);
    expect(localStorage.getItem(draftKey(DRAFT_STORAGE_KEY_PREFIX, SHOW, USER, 'd1'))).toBeNull();
    expect(hasWizardSession(SHOW, USER)).toBe(false);
  });

  it('keeps the unfiled line when only part of the draft was paid for', () => {
    const saved = writeDraft(
      'd1',
      ['dog-1'],
      [
        ['dog-1', 'class-1'],
        ['dog-1', 'class-2'],
      ]
    );
    localStorage.setItem(
      draftMetadataKey(DRAFT_STORAGE_KEY_PREFIX, SHOW, USER),
      JSON.stringify([saved.metadata])
    );
    markWizardSessionOpen(SHOW, USER);

    pruneWizardDraftsForFiledEntries({
      showId: SHOW,
      userId: USER,
      filed: [{ dogId: 'dog-1', classId: 'class-1' }],
    });

    expect(metadataList()).toHaveLength(1);
    const remaining: SavedDraft = JSON.parse(
      localStorage.getItem(draftKey(DRAFT_STORAGE_KEY_PREFIX, SHOW, USER, 'd1'))!
    );
    expect(
      remaining.data._workflowState?.classSelections.flatMap(s =>
        s.selectedClasses.map(c => c.classId)
      )
    ).toEqual(['class-2']);
    // Something is still worth coming back to, so the tab marker stays.
    expect(hasWizardSession(SHOW, USER)).toBe(true);
  });
});
