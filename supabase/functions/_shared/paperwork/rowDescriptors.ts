import type { PaperworkClassFacts, PaperworkScope } from './descriptor.ts';

/** The class columns the paperwork fingerprints read; a `classes` row satisfies this. */
export interface PaperworkClassRow {
  id: string;
  trial_id?: string | null | undefined;
  element?: unknown;
  level?: unknown;
  section?: string | null | undefined;
  status?: unknown;
  /**
   * The class's confirmed judge, resolved by the caller the way the app shows it. `classes.judge_name`
   * was dropped (MYK9-479), so no `classes` row carries it: absent and null hash the same, and a
   * caller that cannot resolve a judge yet must not build a verdict (MYK9-2116).
   */
  judgeName?: string | null | undefined;
  time_limit_seconds?: unknown;
  num_areas?: unknown;
}

/** The entry columns the paperwork fingerprints read; an `entries` row satisfies this. */
export interface PaperworkEntryRow {
  id: string;
  class_id?: string | null | undefined;
  dog_id?: string | null | undefined;
  armband?: string | number | null | undefined;
  run_order?: number | null | undefined;
  check_in_status?: string | null | undefined;
  entry_status?: string | null | undefined;
}

export function paperworkEntryInScope(
  entry: PaperworkEntryRow,
  scope: PaperworkScope,
  classes: readonly PaperworkClassRow[]
): boolean {
  if (scope.kind === 'class') return entry.class_id === scope.classId;
  if (scope.kind === 'trial') {
    const classIds = new Set(
      classes
        .filter(classItem => classItem.trial_id === scope.trialId)
        .map(classItem => classItem.id)
    );
    return entry.class_id != null && classIds.has(entry.class_id);
  }
  return true;
}

/**
 * The classes the selected entries sit in, as the results fingerprints' class subjects. The check-in
 * sheet and scoresheet do not use this: their class subjects are `printedClassHeader` (MYK9-2103).
 */
export function buildPaperworkClassFacts(
  selected: readonly PaperworkEntryRow[],
  classById: ReadonlyMap<string, PaperworkClassRow>
): PaperworkClassFacts[] {
  return [...new Set(selected.map(entry => entry.class_id).filter(Boolean))]
    .map(classId => classById.get(classId as string))
    .filter((classItem): classItem is PaperworkClassRow => Boolean(classItem))
    .map(classItem => ({
      classId: classItem.id,
      trialId: classItem.trial_id ?? '',
      facts: {
        classId: classItem.id,
        trialId: classItem.trial_id,
        element: classItem.element,
        level: classItem.level,
        section: classItem.section,
        status: classItem.status,
        // Optional facts hash as null when absent, so undefined and null never differ.
        judgeName: classItem.judgeName ?? null,
        timeLimitSeconds: classItem.time_limit_seconds,
        areaCount: classItem.num_areas,
      },
    }));
}
