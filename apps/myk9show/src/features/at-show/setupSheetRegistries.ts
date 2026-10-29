import { getSetupSheet, getTrialRegistry } from '@/features/registries';
import type { RegistryId } from '@/features/registries';
import type { AtShowClassGroup } from './atShowClassListAdapter';

/**
 * Registries of the show's trials that have a printed judge setup cheat sheet
 * (MYK9-1078), in first-seen order. Read through `getTrialRegistry`, never the raw column.
 * ASCA has no sheet, so an ASCA-only show returns an empty list.
 */
export function setupSheetRegistryIds(groups: readonly AtShowClassGroup[]): RegistryId[] {
  const ids: RegistryId[] = [];
  for (const { trial } of groups) {
    const id = getTrialRegistry(trial).id;
    if (getSetupSheet(id) && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** Route of the at-show judge setup cheat sheet for a show. */
export function atShowSetupSheetPath(showId: string): string {
  return `/at-show/${encodeURIComponent(showId)}/setup-sheet`;
}
