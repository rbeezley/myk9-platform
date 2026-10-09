/**
 * MYK9-1031: record and undo "scores match the paper" for one class.
 *
 * Offline-first, like the judge's sign-off beside it: the local class row changes at once and the
 * write is queued as an RPC-routed UPDATE (`ReplicatedClassesTable.setResultsVerified`), so a
 * secretary with no signal checks the class and it syncs, in queue order, on reconnect. The
 * server authorizes each one (`mark_class_results_verified` / `clear_class_results_verified`,
 * show managers only).
 *
 * The mark carries the fingerprint of the results the secretary was looking at. It is computed
 * from the same replica the Results tab renders (`replicatedEntriesTable.getEntriesByClass`),
 * which holds every column the server hashes; the secretary read behind the table does not.
 *
 * No React here, so the Results tab and its tests share it.
 */
import { replicatedEntriesTable, replicatedClassesTable } from '@/services/replication';
import {
  classResultsFingerprint,
  type ClassResultsFingerprintEntry,
} from './classResultsFingerprint';

/** The fingerprint of a class's results as this device holds them right now. */
export async function currentClassResultsFingerprint(classId: string): Promise<string> {
  const entries = await replicatedEntriesTable.getEntriesByClass(classId);
  return classResultsFingerprint(
    entries.map((entry): ClassResultsFingerprintEntry => ({
      id: entry.id,
      deleted_at: entry.deleted_at ?? entry.deletedAt ?? null,
      is_scored: entry.is_scored ?? entry.isScored ?? null,
      result_status: entry.result_status ?? entry.resultStatus ?? null,
      search_time_seconds: entry.search_time_seconds ?? entry.searchTimeSeconds ?? null,
      area1_time_seconds: entry.area1_time_seconds ?? null,
      area2_time_seconds: entry.area2_time_seconds ?? null,
      area3_time_seconds: entry.area3_time_seconds ?? null,
      area4_time_seconds: entry.area4_time_seconds ?? null,
      total_correct_finds: entry.total_correct_finds ?? null,
      total_incorrect_finds: entry.total_incorrect_finds ?? null,
      total_faults: entry.total_faults ?? entry.totalFaults ?? null,
      no_finish_count: entry.no_finish_count ?? null,
      total_score: entry.total_score ?? entry.totalScore ?? null,
      points_earned: entry.points_earned ?? null,
      final_placement: entry.final_placement ?? entry.finalPlacement ?? null,
      disqualification_reason: entry.disqualification_reason ?? null,
    }))
  );
}

export async function recordResultsVerified(input: {
  classId: string;
  /** Auth uid of the secretary recording it (the server stamps its own from the JWT). */
  recordedBy: string | null;
  at?: string;
}): Promise<void> {
  const fingerprint = await currentClassResultsFingerprint(input.classId);
  await replicatedClassesTable.setResultsVerified(input.classId, {
    at: input.at ?? new Date().toISOString(),
    by: input.recordedBy,
    fingerprint,
  });
}

export async function clearResultsVerified(classId: string): Promise<void> {
  await replicatedClassesTable.setResultsVerified(classId, null);
}
