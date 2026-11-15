import { replicatedClassesTable } from '@/services/replication';

/**
 * Where a class is scored (MYK9-1971): writes `classes.scores_on_paper` through the replicated
 * classes table, so it lands on this device at once, queues offline and reaches the server and
 * other devices on sync. The Show Desk class switch and the judge-level choice both call this;
 * neither writes PostgREST directly. `true` is paper, `false` is a phone.
 */
export async function setClassScoresOnPaper(classId: string, onPaper: boolean): Promise<void> {
  const current = await replicatedClassesTable.getClassById(classId);
  // Already chosen: no write, so a double tap does not queue a second mutation.
  if (current?.scoresOnPaper === onPaper) return;
  await replicatedClassesTable.updateClass(classId, { scoresOnPaper: onPaper });
}

/** One judge's classes follow one choice. Each class is its own mutation; the first failure rejects after all were tried. */
export async function setClassesScoreOnPaper(
  classIds: readonly string[],
  onPaper: boolean
): Promise<void> {
  const results = await Promise.allSettled(classIds.map(id => setClassScoresOnPaper(id, onPaper)));
  const failed = results.find(result => result.status === 'rejected');
  if (failed?.status === 'rejected') throw failed.reason;
}
