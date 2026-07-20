import { replicatedClassesTable } from '@/services/replication';

/**
 * Records a secretary's day-of expectation without changing the configured
 * scheduled start. The timestamp is an instant so every show-day surface can
 * render it in the Trial timezone.
 */
export async function setRevisedExpectedStart(
  classId: string,
  revisedExpectedStart: string | null
): Promise<void> {
  if (revisedExpectedStart !== null && Number.isNaN(new Date(revisedExpectedStart).getTime())) {
    throw new Error('Revised expected start must be a valid timestamp');
  }

  await replicatedClassesTable.updateClass(classId, { revisedExpectedStart });
}
