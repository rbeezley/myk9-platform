/**
 * MYK9-1031: the replica side of "scores match the paper".
 *
 * Pure helpers for `ReplicatedClassesTable.setResultsVerified` and its conflict merge, kept out of
 * the (already large) table file. The wire contract is migration 20261008014300: the check is
 * stamped by `mark_class_results_verified(p_class_id, p_results_fingerprint, p_verified_at)` and
 * removed by `clear_class_results_verified(p_class_id)`.
 */
import type { PendingMutation } from '@myk9/replication';

export const MARK_RESULTS_VERIFIED_RPC = 'mark_class_results_verified';
export const CLEAR_RESULTS_VERIFIED_RPC = 'clear_class_results_verified';

export interface ResultsVerifiedStamp {
  at: string;
  /** Auth uid of the secretary recording it (the server stamps its own from the JWT). */
  by: string | null;
  /** `classResultsFingerprint` of the results the secretary checked. */
  fingerprint: string;
}

export interface ResultsVerifiedFields {
  resultsVerifiedAt?: string | null | undefined;
  resultsVerifiedBy?: string | null | undefined;
  resultsVerifiedFingerprint?: string | null | undefined;
}

/**
 * The fields a record or an undo leaves on the local row. A class already checked against the SAME
 * results keeps its first stamp, as the server does; a check over different results (a correction
 * cleared the old one) takes the new stamp.
 */
export function nextResultsVerifiedFields(
  current: ResultsVerifiedFields,
  stamp: ResultsVerifiedStamp | null
): Required<ResultsVerifiedFields> {
  if (!stamp) {
    return { resultsVerifiedAt: null, resultsVerifiedBy: null, resultsVerifiedFingerprint: null };
  }
  if (current.resultsVerifiedAt && current.resultsVerifiedFingerprint === stamp.fingerprint) {
    return {
      resultsVerifiedAt: current.resultsVerifiedAt,
      resultsVerifiedBy: current.resultsVerifiedBy ?? null,
      resultsVerifiedFingerprint: stamp.fingerprint,
    };
  }
  return {
    resultsVerifiedAt: stamp.at,
    resultsVerifiedBy: stamp.by,
    resultsVerifiedFingerprint: stamp.fingerprint,
  };
}

function sameInstant(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return new Date(a).getTime() === new Date(b).getTime();
}

/**
 * Server rows never carry the fingerprint, so a clean merge would drop it. Keep it while the
 * server is echoing back the very stamp this device sent: it is what still lets a local correction
 * (made before the server hears of it) retract the check.
 */
export function keepLocalResultsFingerprint<T extends ResultsVerifiedFields>(
  local: ResultsVerifiedFields,
  remote: T
): T {
  if (!local.resultsVerifiedFingerprint) return remote;
  if (!sameInstant(local.resultsVerifiedAt, remote.resultsVerifiedAt)) return remote;
  return { ...remote, resultsVerifiedFingerprint: local.resultsVerifiedFingerprint };
}

/**
 * The class a permanently failed `mark_class_results_verified` was for, and the stamp it sent.
 * Read from the call's own arguments: the sync-failed event reports the RPC, not the row id.
 */
export function refusedResultsVerifiedMark(
  mutation: Pick<PendingMutation, 'rpc'>
): { classId: string; at: string | null } | null {
  if (mutation.rpc?.name !== MARK_RESULTS_VERIFIED_RPC) return null;
  const { p_class_id: classId, p_verified_at: at } = mutation.rpc.args ?? {};
  if (typeof classId !== 'string') return null;
  return { classId, at: typeof at === 'string' ? at : null };
}
