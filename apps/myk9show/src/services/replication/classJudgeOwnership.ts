/**
 * MYK9-1327: who owns a class row's judge fields while a judge change is still on its way.
 *
 * A judge change queues judge_assignments writes and writes the new judge onto the LOCAL class row
 * (no class UPDATE: the server trigger on judge_assignments already bumps the class). The server
 * derives the judge from those assignments, so until they upload, every server copy of the class
 * names the OLD judge. The row therefore carries a local-only marker, the ids of the assignment
 * mutations behind the choice, and every path that lays server data over the row applies one rule:
 *
 *  - some marker id is still unsent (pending, or failed and kept for Retry/Discard): keep the
 *    local judge fields and the marker, take every other column from the server;
 *  - otherwise: drop the marker and take the server's judge (another secretary's later
 *    assignment wins once every related write is acknowledged, or the user discarded the change).
 *
 * The marker is never sent: `toSupabaseRow` is an allowlist and does not list it.
 */
import type { ReplicatedClass } from './ReplicatedClassesTable';

/** The judge columns that travel together, never half-replaced. */
export const CLASS_JUDGE_FIELD_KEYS = [
  'judgeId',
  'judgeName',
  'judgeFirstName',
  'judgeLastName',
  'judgeResolved',
] as const;

/** Mutation ids of the judge_assignments writes behind this row's local judge. */
export const JUDGE_OWNERSHIP_KEY = '_judgeAssignmentMutationIds' as const;

/** The queue table whose mutations the marker names. */
export const JUDGE_ASSIGNMENTS_TABLE = 'judge_assignments';

/**
 * The undelivered judge_assignments mutation ids, or `null` when the queue could not be read:
 * unknown is never "all delivered", so a marked row keeps its local judge until the queue answers.
 */
export type UnsentIds = ReadonlySet<string> | null;

export const NO_UNSENT_IDS: UnsentIds = new Set();

export function mergeUnsentIds(a: UnsentIds, b: UnsentIds): UnsentIds {
  return a === null || b === null ? null : new Set([...a, ...b]);
}

export function judgeMarkerIds(row: ReplicatedClass | null | undefined): readonly string[] {
  const ids = row?.[JUDGE_OWNERSHIP_KEY];
  return Array.isArray(ids) ? ids : [];
}

/** True when a marker id is still undelivered, so the local judge must survive a server copy. */
export function ownsLocalJudge(
  local: ReplicatedClass | null | undefined,
  unsent: UnsentIds
): boolean {
  const ids = judgeMarkerIds(local);
  return unsent === null ? ids.length > 0 : ids.some(id => unsent.has(id));
}

/**
 * `incoming` is the row a server copy would leave; returns the row to store. Without a marker on
 * `local` it is `incoming` untouched. With one, the local judge stays (marker included) while any
 * marker id is unsent; once none is, the marker is dropped and the server's judge stands.
 */
export function applyJudgeOwnership(
  local: ReplicatedClass | null | undefined,
  incoming: ReplicatedClass,
  unsent: UnsentIds
): ReplicatedClass {
  if (!local || judgeMarkerIds(local).length === 0) return incoming;
  const withoutMarker = { ...incoming };
  delete withoutMarker[JUDGE_OWNERSHIP_KEY];
  if (!ownsLocalJudge(local, unsent)) return withoutMarker;
  return {
    ...withoutMarker,
    judgeId: local.judgeId,
    judgeName: local.judgeName,
    judgeFirstName: local.judgeFirstName,
    judgeLastName: local.judgeLastName,
    judgeResolved: local.judgeResolved,
    [JUDGE_OWNERSHIP_KEY]: [...judgeMarkerIds(local)],
  };
}
