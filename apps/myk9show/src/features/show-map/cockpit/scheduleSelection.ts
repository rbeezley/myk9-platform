/**
 * The show home's "Select classes" mode (MYK9-1324): which classes on the schedule are ticked
 * for a bulk action. Pure, so the rules the bulk bar relies on are tested on their own.
 *
 * Bulk actions never span trials, the rule Setup → Classes held. Ticking a class in another
 * trial starts a new selection there, and `switchedFrom` names the trial it replaced so the
 * schedule can say so. A selection never reaches a row the secretary cannot see:
 * `pruneSelection` drops ticks the day chips, a filter or a collapse hid.
 */
export interface ScheduleSelection {
  trialId: string | null;
  classIds: readonly string[];
  /** The trial whose selection the last tick replaced; null when nothing was replaced. */
  switchedFrom: string | null;
}

export const EMPTY_SCHEDULE_SELECTION: ScheduleSelection = {
  trialId: null,
  classIds: [],
  switchedFrom: null,
};

function startIn(
  selection: ScheduleSelection,
  trialId: string,
  classIds: readonly string[]
): ScheduleSelection {
  const replaced = selection.trialId !== null && selection.classIds.length > 0;
  return { trialId, classIds, switchedFrom: replaced ? selection.trialId : null };
}

export function toggleScheduleClass(
  selection: ScheduleSelection,
  classId: string,
  trialId: string
): ScheduleSelection {
  if (selection.trialId !== trialId) return startIn(selection, trialId, [classId]);
  const ticked = selection.classIds.includes(classId);
  return {
    ...selection,
    classIds: ticked
      ? selection.classIds.filter(id => id !== classId)
      : [...selection.classIds, classId],
    switchedFrom: null,
  };
}

/** The trial heading's checkbox: ticks every visible class of the trial, or clears them all. */
export function toggleScheduleTrial(
  selection: ScheduleSelection,
  trialId: string,
  visibleClassIds: readonly string[]
): ScheduleSelection {
  if (selection.trialId !== trialId) return startIn(selection, trialId, visibleClassIds);
  const allTicked =
    visibleClassIds.length > 0 && visibleClassIds.every(id => selection.classIds.includes(id));
  return { ...selection, classIds: allTicked ? [] : visibleClassIds, switchedFrom: null };
}

export function trialSelectionState(
  selection: ScheduleSelection,
  trialId: string,
  visibleClassIds: readonly string[]
): 'all' | 'some' | 'none' {
  if (selection.trialId !== trialId || visibleClassIds.length === 0) return 'none';
  const ticked = visibleClassIds.filter(id => selection.classIds.includes(id)).length;
  if (ticked === 0) return 'none';
  return ticked === visibleClassIds.length ? 'all' : 'some';
}

/** Drops ticks on rows that are no longer visible. Returns the same object when nothing changed. */
export function pruneSelection(
  selection: ScheduleSelection,
  visibleClassIds: ReadonlySet<string>
): ScheduleSelection {
  const kept = selection.classIds.filter(id => visibleClassIds.has(id));
  if (kept.length === selection.classIds.length) return selection;
  return kept.length === 0 ? EMPTY_SCHEDULE_SELECTION : { ...selection, classIds: kept };
}
