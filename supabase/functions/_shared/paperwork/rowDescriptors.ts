import {
  buildCheckInPaperworkDescriptor,
  buildScoreSheetPaperworkDescriptor,
  type PaperworkClassFacts,
  type PaperworkDescriptor,
  type PaperworkScope,
} from './descriptor.ts';

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
  num_hides?: unknown;
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

/** The classes the selected entries sit in, as the fingerprints' class subjects. */
export function buildPaperworkClassFacts(
  reportId: string,
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
        // The check-in sheet and scoresheets do not print the class's own status, so starting or
        // finishing a class must not read as a change (MYK9-2074). The results sheet keeps it.
        ...(reportId === 'scoresheet' ? {} : { status: classItem.status }),
        // Optional facts hash as null when absent, so undefined and null never differ.
        judgeName: classItem.judgeName ?? null,
        ...(reportId === 'check-in-sheet'
          ? {}
          : {
              timeLimitSeconds: classItem.time_limit_seconds,
              areaCount: classItem.num_areas,
            }),
        // Only the scoresheet prints Hides.
        ...(reportId === 'scoresheet' ? { hides: classItem.num_hides ?? null } : {}),
      },
    }));
}

/** Null when the scope holds no entries, or the report is not one of the two paper sheets. */
export function buildSheetDescriptorFromRows(input: {
  reportId: string;
  scope: PaperworkScope;
  classes: readonly PaperworkClassRow[];
  entries: readonly PaperworkEntryRow[];
}): PaperworkDescriptor | null {
  const selected = input.entries.filter(entry =>
    paperworkEntryInScope(entry, input.scope, input.classes)
  );
  if (selected.length === 0) return null;
  const classById = new Map(input.classes.map(classItem => [classItem.id, classItem] as const));
  const baseEntry = (entry: PaperworkEntryRow) => ({
    entryId: entry.id,
    classId: entry.class_id ?? '',
    dogId: entry.dog_id ?? '',
    armband: entry.armband == null ? null : Number(entry.armband),
    runOrder: entry.run_order ?? null,
    checkInStatus: entry.check_in_status ?? null,
    entryStatus: entry.entry_status ?? null,
  });
  const trialIdOf = (entry: PaperworkEntryRow) =>
    classById.get(entry.class_id ?? '')?.trial_id ?? undefined;

  if (input.reportId === 'check-in-sheet') {
    return buildCheckInPaperworkDescriptor(
      input.scope,
      selected.map(entry => ({ ...baseEntry(entry), trialId: trialIdOf(entry) })),
      buildPaperworkClassFacts(input.reportId, selected, classById)
    );
  }
  if (input.reportId === 'scoresheet') {
    return buildScoreSheetPaperworkDescriptor(
      input.scope,
      selected.map(entry => ({
        ...baseEntry(entry),
        section: classById.get(entry.class_id ?? '')?.section ?? null,
        trialId: trialIdOf(entry),
      })),
      buildPaperworkClassFacts(input.reportId, selected, classById)
    );
  }
  return null;
}
