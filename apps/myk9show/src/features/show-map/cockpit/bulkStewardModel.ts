/**
 * The wording of Select classes' Assign steward (MYK9-2328): what the button says, how many
 * classes already have this person in this job, and which classes they handle a dog in.
 */
export function bulkStewardSummary({
  classes,
  toAssignIds,
  conflictClassIds,
}: {
  classes: ReadonlyArray<{ id: string; name: string }>;
  toAssignIds: readonly string[];
  conflictClassIds: ReadonlySet<string>;
}): {
  confirmLabel: string;
  alreadyCount: number;
  alreadyText: string;
  conflictNames: string[];
} {
  const toAssign = new Set(toAssignIds);
  const count = toAssign.size;
  const alreadyCount = classes.filter(cls => !toAssign.has(cls.id)).length;
  return {
    confirmLabel:
      count === 0 ? 'Already assigned' : `Assign to ${count} ${count === 1 ? 'class' : 'classes'}`,
    alreadyCount,
    alreadyText:
      alreadyCount === 1
        ? 'They already have this job in 1 of these classes; it is skipped.'
        : `They already have this job in ${alreadyCount} of these classes; those are skipped.`,
    conflictNames: classes
      .filter(cls => toAssign.has(cls.id) && conflictClassIds.has(cls.id))
      .map(cls => cls.name),
  };
}

/**
 * The classes Assign steward acts on, and its button label. A cancelled class has no ring to
 * staff, so it is left out, and the label says how many of the ticked classes remain.
 */
export function bulkStewardTargets(
  picked: ReadonlyArray<{ id: string; name: string; lifecycle?: string | null }>
): { targets: Array<{ id: string; name: string }>; label: string } {
  const targets = picked
    .filter(cls => cls.lifecycle !== 'cancelled')
    .map(cls => ({ id: cls.id, name: cls.name }));
  return {
    targets,
    label:
      targets.length === picked.length
        ? 'Assign steward'
        : `Assign steward (${targets.length} of ${picked.length})`,
  };
}
