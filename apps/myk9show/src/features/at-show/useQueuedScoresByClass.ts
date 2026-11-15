/**
 * Scores on this device that have not reached the server, counted per class
 * (MYK9-1506). Reads the same durable queue and dead letters the header's count
 * reads (`readDeviceUnsentWork`); there is no second queue. MYK9-2011: a score the
 * server refused still counts, so a card never reads as sent while a score sits here.
 *
 * A score is an `entries` write routed through the ringside RPC whose delta marks
 * the entry scored. A class with none is in sync, which is all the card claims: it
 * never infers staleness from elapsed time, so a finished or untouched class cannot
 * read as "outdated".
 */
import { useEffect, useState } from 'react';
import type { PendingMutation } from '@myk9/replication';
import { replicatedEntriesTable } from '@/services/replication';
import { isScoreMutation, readDeviceUnsentWork } from '@/services/replication/unsentWork';
import { UNSENT_WORK_REFRESH_EVENTS as REFRESH_EVENTS } from '@/hooks/useUnsentWork';

const EMPTY: ReadonlyMap<string, number> = new Map();

/** Entry ids with a queued score, one per entry however many times it was re-queued. */
export function queuedScoreEntryIds(mutations: readonly PendingMutation[]): Set<string> {
  const ids = new Set<string>();
  for (const mutation of mutations) {
    if (isScoreMutation(mutation)) ids.add(mutation.rowId);
  }
  return ids;
}

/** Roll queued-score entry ids up to `classId -> count`; entries unknown to the replica are skipped. */
export function countQueuedScoresByClass(
  entryIds: ReadonlySet<string>,
  classIdByEntryId: ReadonlyMap<string, string>
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entryId of entryIds) {
    const classId = classIdByEntryId.get(entryId);
    if (classId) counts.set(classId, (counts.get(classId) ?? 0) + 1);
  }
  return counts;
}

async function readQueuedScoresByClass(showId: string): Promise<Map<string, number>> {
  const { scores } = await readDeviceUnsentWork();
  // A refused version a newer score replaced is listed, not counted: nothing is left to send.
  const entryIds = new Set(scores.filter(s => s.state !== 'superseded').map(s => s.entryId));
  if (entryIds.size === 0) return new Map();
  const entries = await replicatedEntriesTable.getEntriesByShow(showId);
  return countQueuedScoresByClass(
    entryIds,
    new Map(entries.flatMap(e => (e.classId ? [[e.id, e.classId] as const] : [])))
  );
}

/** `classId -> queued score count` for classes with at least one; empty when everything is uploaded. */
export function useQueuedScoresByClass(showId: string | undefined): ReadonlyMap<string, number> {
  const [counts, setCounts] = useState<ReadonlyMap<string, number>>(EMPTY);

  useEffect(() => {
    if (!showId) return;
    let cancelled = false;
    const refresh = () => {
      readQueuedScoresByClass(showId)
        .then(next => {
          if (!cancelled) setCounts(next);
        })
        .catch(() => {
          /* best-effort; keep the last known counts */
        });
    };
    refresh();
    for (const eventName of REFRESH_EVENTS) window.addEventListener(eventName, refresh);
    return () => {
      cancelled = true;
      for (const eventName of REFRESH_EVENTS) window.removeEventListener(eventName, refresh);
    };
  }, [showId]);

  return showId ? counts : EMPTY;
}
