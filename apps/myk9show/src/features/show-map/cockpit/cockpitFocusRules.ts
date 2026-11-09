import { matchesCockpitClassFilters } from './cockpitClassFilters';
import type { CockpitUrlState } from './cockpitRoutes';
import type { CockpitClassFilters, SecretaryCockpitModel } from './secretaryCockpitTypes';

/**
 * When the selected class's panel shows (MYK9-1727).
 *
 * A class the secretary picked stays open even after her own work in it takes it out of the
 * filter (assigning the judge under "Needs attention", completing it under "In progress"):
 * losing the class mid-task is worse than a panel the list no longer shows. Changing the FILTER
 * so the picked class no longer matches clears the pick instead (`filtersUpdate`). The automatic
 * default (no pick) only ever shows a class the schedule shows.
 */
export function focusedPanelShows(
  model: SecretaryCockpitModel,
  /** The class the secretary clicked this visit (not the URL, which records defaults too). */
  pickedClassId: string | undefined
): { shows: boolean; listed: boolean } {
  const focusedId = model.focusedClass?.id;
  const listed = model.trialGroups.some(group =>
    group.classes.some(classItem => classItem.id === focusedId)
  );
  const picked = focusedId !== undefined && focusedId === pickedClassId;
  return { shows: Boolean(model.focusedClass) && (listed || picked), listed };
}

/**
 * The state change for a changed filter group: the picked class is let go when the new filters
 * (the current ones with this update applied, any group) would hide it, so a filter change never
 * leaves a class open that the list hides.
 */
export function filtersUpdate(
  model: SecretaryCockpitModel,
  pickedClassId: string | undefined,
  current: CockpitClassFilters,
  update: CockpitClassFilters
): Partial<CockpitUrlState> {
  const row = pickedClassId
    ? model.daySchedule.find(classItem => classItem.id === pickedClassId)
    : undefined;
  const stillMatches =
    !row ||
    matchesCockpitClassFilters(row.filterFacts, { ...current, ...update }, row.attentionCount);
  return stillMatches ? update : { ...update, focusedClassId: undefined, anchor: undefined };
}
