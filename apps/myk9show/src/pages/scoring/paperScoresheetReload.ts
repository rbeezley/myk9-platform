import { loadEntriesWithDogs } from './paperScoresheetData';
import { calculatePlacements, type ScoringEntry } from './types';

/**
 * The class's entries after a save or clear has landed, or null when the
 * device cannot read them (MYK9-774). The caller must not keep scoring on the
 * list it already holds: that list still shows the saved dog as it was, so
 * "save and next" could route the judge back to it and the old result would
 * show. Rebuilding results locally would duplicate the scoring rules, so the
 * caller pauses scoring until a read succeeds instead.
 */
export async function refreshEntriesAfterSave(classId: string): Promise<ScoringEntry[] | null> {
  try {
    return calculatePlacements(await loadEntriesWithDogs(classId));
  } catch {
    return null;
  }
}

/** Shown in place of the scoresheet while the refreshed list cannot be read. */
export const REFRESH_FAILED_MESSAGE =
  "Saved. This class's list couldn't refresh on this device, so scoring is paused until it does.";
