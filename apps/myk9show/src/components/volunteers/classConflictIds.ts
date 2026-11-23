/**
 * The volunteers who handle a dog in one class, read from `useVolunteerConflicts`'s
 * Map<volunteerId, Set<classId>>. A volunteer in that set gets the warning on their chip.
 */
export function classConflictIds(
  conflictMap: ReadonlyMap<string, ReadonlySet<string>>,
  classId: string
): Set<string> {
  const ids = new Set<string>();
  for (const [volunteerId, classIds] of conflictMap) {
    if (classIds.has(classId)) ids.add(volunteerId);
  }
  return ids;
}
