/**
 * MYK9-1327: queue bookkeeping for `set_class_judge` picks on ONE class.
 *
 * A pick is a single baked-args RPC mutation (`UPDATE classes/<id>`). Two things keep a run of
 * picks, and a pick on a class created in the same pass, in the order the secretary made them:
 *  - `dependsOn`: the class's pending INSERT (the wizard creates the class and picks its judge
 *    offline in one pass), the picked person's pending `people` INSERT (a person created offline
 *    through the show-desk people table, a direct INSERT with a client-made id and no remap; the
 *    runner moves past a backed-off INSERT, and the pick would then hit 22023 and park), and the
 *    latest pending or failed pick. It never names an unrelated
 *    class edit, so a parked status edit does not block a pick.
 *  - supersede: a newer pick discards the class's earlier FAILED picks, so Retry in Sync issues
 *    cannot replay an old intent over the new one.
 *
 * Every read goes through the MutationManager's owner-scoped queue reads, so another account's
 * work on this device is never named or discarded.
 */
import { logger } from '@myk9/core';
import type {
  MutationManager,
  PendingMutation,
  UploadCompleteEventDetail,
} from '@myk9/replication';
import { invalidateClassEnrichment } from './classEnrichmentCache';

export const SET_CLASS_JUDGE_RPC = 'set_class_judge';

type QueueReader = Pick<
  MutationManager,
  'getPendingMutationsForRow' | 'getFailedMutations' | 'discardFailedMutation'
>;

const isPickFor = (mutation: PendingMutation, classId: string): boolean =>
  mutation.tableName === 'classes' &&
  String(mutation.rowId) === classId &&
  mutation.rpc?.name === SET_CLASS_JUDGE_RPC;

const queueOrder = (a: PendingMutation, b: PendingMutation): number =>
  (a.sequenceNumber ?? 0) - (b.sequenceNumber ?? 0) || a.timestamp - b.timestamp;

interface ClassPickQueue {
  pendingInserts: PendingMutation[];
  pendingPicks: PendingMutation[];
  failedPicks: PendingMutation[];
}

async function readPickQueue(queue: QueueReader, classId: string): Promise<ClassPickQueue> {
  const [pending, failed] = await Promise.all([
    queue.getPendingMutationsForRow('classes', classId),
    queue.getFailedMutations(),
  ]);
  return {
    pendingInserts: pending.filter(m => m.operation === 'INSERT'),
    pendingPicks: pending.filter(m => isPickFor(m, classId)).sort(queueOrder),
    failedPicks: failed.filter(m => isPickFor(m, classId)).sort(queueOrder),
  };
}

/** What a newly queued pick must wait for, and which earlier failed picks it replaces. */
export async function planClassJudgePick(
  queue: QueueReader,
  classId: string,
  personId: string | null
): Promise<{ dependsOn: string[] | undefined; supersededFailedIds: string[] }> {
  const { pendingInserts, pendingPicks, failedPicks } = await readPickQueue(queue, classId);
  const personInserts = personId
    ? (await queue.getPendingMutationsForRow('people', personId)).filter(
        m => m.operation === 'INSERT'
      )
    : [];
  const latestPick = [...pendingPicks, ...failedPicks].sort(queueOrder).at(-1);
  const dependsOn = [
    ...pendingInserts.map(m => m.id),
    ...personInserts.map(m => m.id),
    ...(latestPick ? [latestPick.id] : []),
  ];
  return {
    dependsOn: dependsOn.length > 0 ? dependsOn : undefined,
    supersededFailedIds: failedPicks.map(m => m.id),
  };
}

/**
 * Drop earlier failed picks once the newer pick that replaces them is durably queued. Each id is
 * tried on its own, and a failure is logged, never thrown: the new pick is already queued, and a
 * leftover superseded pick only costs the secretary a Discard in Sync issues.
 */
export async function discardSupersededPicks(queue: QueueReader, ids: string[]): Promise<void> {
  for (const id of ids) {
    try {
      await queue.discardFailedMutation(id);
    } catch (error) {
      logger.warn('Could not discard a superseded set_class_judge pick', 'replication', {
        mutationId: id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/** True when an upload batch carried a `set_class_judge` pick. */
export function invalidatesClassEnrichment(detail: UploadCompleteEventDetail): boolean {
  return detail.mutations?.some(m => m.rpcName === SET_CLASS_JUDGE_RPC) === true;
}

/**
 * A sync that ran while a pick was queued refilled the judge-name cache from the server's OLD
 * judge. Once the pick has uploaded, the post-upload class pull must not reuse it. Call before
 * that sync is triggered.
 */
export function invalidateEnrichmentForUpload(detail: UploadCompleteEventDetail): void {
  if (invalidatesClassEnrichment(detail)) invalidateClassEnrichment();
}

/** The judge a pick puts on a class; names are optional (the wizard and reassign know only the id). */
export interface ClassJudgeTarget {
  personId: string;
  name?: string | undefined;
  firstName?: string | undefined;
  lastName?: string | undefined;
}

interface ClassJudgeFields {
  judgeId?: string | undefined;
  judgeName?: string | undefined;
  judgeFirstName?: string | undefined;
  judgeLastName?: string | undefined;
  judgeResolved: true;
}

/**
 * The class row's judge fields after a pick. Never a name beside a different judge's id: without
 * a name given, the row keeps its name only when it already names this judge (the wizard creates
 * the class with it), else it is cleared. `judgeResolved` is a deliberate local answer, not "the
 * judge lookup never ran" (see mergeTrialClassData).
 */
export function judgeFieldsAfterPick(
  current: Pick<ClassJudgeFields, 'judgeId' | 'judgeName' | 'judgeFirstName' | 'judgeLastName'>,
  judge: ClassJudgeTarget | null
): ClassJudgeFields {
  // Explicit undefined, not omitted: the caller spreads this over the row, and an omitted key
  // would leave the previous judge on it.
  if (!judge) {
    return {
      judgeId: undefined,
      judgeName: undefined,
      judgeFirstName: undefined,
      judgeLastName: undefined,
      judgeResolved: true,
    };
  }
  const named = judge.name !== undefined || judge.firstName !== undefined;
  const keeps = !named && (current.judgeId || null) === judge.personId;
  return {
    judgeId: judge.personId,
    judgeName: named ? judge.name : keeps ? current.judgeName : undefined,
    judgeFirstName: named ? judge.firstName : keeps ? current.judgeFirstName : undefined,
    judgeLastName: named ? judge.lastName : keeps ? current.judgeLastName : undefined,
    judgeResolved: true,
  };
}
