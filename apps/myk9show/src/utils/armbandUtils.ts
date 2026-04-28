export interface ArmbandAssignment {
  dogId: string;
  armband: string;
}

export function computeArmbandAssignments(
  dogIds: string[],
  startNumber: number
): ArmbandAssignment[] {
  return dogIds.map((dogId, i) => ({ dogId, armband: String(startNumber + i) }));
}

export function resolveStartNumber(
  existingMaxArmband: string | null | undefined,
  startNumber: number
): number {
  if (!existingMaxArmband) return startNumber;
  const parsed = parseInt(existingMaxArmband, 10);
  if (isNaN(parsed)) return startNumber;
  return Math.max(startNumber, parsed + 1);
}
