import type { DraftMetadata, SavedDraft } from './useDraftPersistence';

/** Derive eligibility from the payload, not a potentially stale preview. */
export function readSavedDraftMetadata(
  metadata: DraftMetadata,
  key: string,
  showId: string,
  userId: string
): DraftMetadata {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { ...metadata, selectedDogsCount: 0, completed: false };
    const saved: SavedDraft = JSON.parse(raw);
    if (
      saved.metadata?.id !== metadata.id ||
      saved.metadata.showId !== showId ||
      saved.metadata.userId !== userId
    ) {
      return { ...metadata, selectedDogsCount: 0, completed: false };
    }
    return {
      ...metadata,
      selectedDogsCount: Array.isArray(saved.data?.selectedDogs)
        ? saved.data.selectedDogs.length
        : 0,
      completed: saved.data?._workflowState?.currentStep === 'confirmation',
    };
  } catch {
    return { ...metadata, selectedDogsCount: 0, completed: false };
  }
}
