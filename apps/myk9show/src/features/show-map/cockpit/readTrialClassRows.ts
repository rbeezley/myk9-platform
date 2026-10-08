import { getClassesByTrialId } from '@/services/database/classes';

/**
 * THE class rows every paperwork fingerprint is built from.
 *
 * A print counts as current only when the fingerprint built now equals the one stored with the
 * confirmation, and that fingerprint includes class facts (`time_limit_seconds`, `num_areas`,
 * `judge_name`, ...). Reports and Overview must therefore read the SAME full rows, never project
 * their own: Overview's camelCase tree rows lack those facts, so a print confirmed on one surface
 * read as stale on the other. `getClassesByTrialId` is replication-backed, so this works offline.
 */
export async function readTrialClassRows(trialIds: readonly string[]) {
  const results = await Promise.all(trialIds.map(id => getClassesByTrialId(id)));
  const failed = results.find(result => result.error);
  if (failed?.error) throw failed.error;
  return results.flatMap(({ data }) => data ?? []);
}
