import { loadEntriesWithDogs } from './paperScoresheetData';
import { calculatePlacements, type ScoringEntry } from './types';

/**
 * The class's entries after a save. The save has already landed, so a failed
 * device read must not read as a failed save: keep the current list and report
 * that it could not refresh (MYK9-774).
 */
export async function reloadEntriesAfterSave(
  classId: string,
  current: ScoringEntry[]
): Promise<{ entries: ScoringEntry[]; refreshed: boolean }> {
  try {
    return { entries: calculatePlacements(await loadEntriesWithDogs(classId)), refreshed: true };
  } catch {
    return { entries: current, refreshed: false };
  }
}
