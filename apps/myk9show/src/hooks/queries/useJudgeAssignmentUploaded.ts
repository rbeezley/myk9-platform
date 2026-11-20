import { useEffect, useState } from 'react';
import { replicatedJudgeAssignmentsTable } from '@/services/replication';

/**
 * MYK9-2294: whether each judge's assignment to a show is on the server, so a secretary's
 * affiliation edit (an online RPC that the server refuses for an unassigned judge) is offered
 * only once it can succeed.
 *
 * A judge is "uploaded" when this device holds at least one `judge_assignments` row for the show
 * and none of them has unsent work: not local-only, not dirty, no pending or failed mutation
 * (`hasUnsyncedLocalWork`, the replication layer's own test). A judge ticked in the form but not
 * yet saved has no row, so is not uploaded either. Re-evaluated whenever the table changes, so
 * the field enables once the upload is acknowledged. Reading the queue can fail; an unread
 * queue is never a pass.
 */
export function useJudgeAssignmentUploaded(showId: string | undefined): ReadonlySet<string> {
  const [uploaded, setUploaded] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    if (!showId) {
      setUploaded(new Set());
      return;
    }
    let cancelled = false;
    let latest = 0;
    const refresh = async () => {
      const run = ++latest;
      let next: Set<string>;
      try {
        const rows = (await replicatedJudgeAssignmentsTable.getAllOrThrow()).filter(
          row => row.showId === showId && row.status !== 'declined' && row.status !== 'cancelled'
        );
        const unsynced = await Promise.all(
          rows.map(row => replicatedJudgeAssignmentsTable.hasUnsyncedLocalWork(row.id))
        );
        const blocked = new Set<string>();
        const seen = new Set<string>();
        rows.forEach((row, i) => {
          seen.add(row.personId);
          if (
            unsynced[i] ||
            row._localOnly === true ||
            (row._syncStatus !== undefined && row._syncStatus !== 'synced')
          ) {
            blocked.add(row.personId);
          }
        });
        next = new Set([...seen].filter(id => !blocked.has(id)));
      } catch {
        next = new Set();
      }
      if (!cancelled && run === latest) setUploaded(next);
    };
    void refresh();
    const unsubscribe = replicatedJudgeAssignmentsTable.subscribe(() => void refresh(), {
      emitCurrent: false,
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [showId]);

  return uploaded;
}
