import { matchesAnyCockpitStatus } from './secretaryCockpitAttention';
import type { CockpitUrlState } from './cockpitRoutes';
import type { CockpitStatus, SecretaryCockpitModel } from './secretaryCockpitTypes';

/**
 * When the selected class's panel shows (MYK9-1727).
 *
 * A class the secretary picked stays open even after her own work in it takes it out of the
 * filter (assigning the judge under "Needs attention", completing it under "In progress"):
 * losing the class mid-task is worse than a panel the list no longer shows. Changing the FILTER
 * so the picked class no longer matches clears the pick instead (`statusesUpdate`). The automatic
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
 * The state change for a new set of ticked statuses: the picked class is let go when the new
 * filter would hide it, so a filter change never leaves a class open that the list hides.
 */
export function statusesUpdate(
  model: SecretaryCockpitModel,
  pickedClassId: string | undefined,
  statuses: CockpitStatus[]
): Partial<CockpitUrlState> {
  const row = pickedClassId
    ? model.daySchedule.find(classItem => classItem.id === pickedClassId)
    : undefined;
  const stillMatches =
    !row ||
    matchesAnyCockpitStatus(
      { lifecycle: row.lifecycle.value, closeout: row.closeout },
      statuses,
      row.attentionCount
    );
  return stillMatches ? { statuses } : { statuses, focusedClassId: undefined, anchor: undefined };
}
