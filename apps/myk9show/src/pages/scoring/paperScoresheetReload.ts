import { loadEntriesWithDogs } from './paperScoresheetData';
import { calculatePlacements, type ScoringEntry } from './types';

/** The change that just landed, applied locally when the list cannot refresh. */
export interface LandedScoreChange {
  entryId: string;
  scored: boolean;
}

/**
 * The class's entries after a save or clear. The change has already landed, so
 * a failed device read must not read as a failed save (MYK9-774). Nor may it
 * leave the list as it was: the saved dog would still read unscored, and the
 * next "save and next" could route the judge back to it and overwrite its
 * score. So the fallback applies the landed change to the current list.
 */
export async function reloadEntriesAfterSave(
  classId: string,
  current: ScoringEntry[],
  landed: LandedScoreChange
): Promise<{ entries: ScoringEntry[]; refreshed: boolean }> {
  try {
    return { entries: calculatePlacements(await loadEntriesWithDogs(classId)), refreshed: true };
  } catch {
    const entries = current.map(entry =>
      entry.entryId === landed.entryId
        ? {
            ...entry,
            isScored: landed.scored,
            status: landed.scored ? ('scored' as const) : ('pending' as const),
          }
        : entry
    );
    return { entries, refreshed: false };
  }
}
