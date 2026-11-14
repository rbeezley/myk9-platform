/**
 * How each of the signed-in exhibitor's own entries may show its place in line on the entry list
 * (MYK9-1970). The list counts places itself from the rows it renders, so the one thing it needs
 * from outside is the claim: the server's answer when it has one (`live`, `paper`, `stale`), else
 * `paper` when the replica holds the class as paper, so a phone with no signal still says so.
 * An entry with neither is absent from the map and reads live.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { classScoresOnPaper, type QueueClaim } from '@myk9/ringside/run-queue';
import { replicatedClassesTable, replicatedShowsTable } from '@/services/replication';
import { useMyEntryQueuePlaces } from '@/hooks/queries/useMyEntryQueuePlaces';

interface OwnableEntry {
  id: string;
  classId: string;
}

async function readPaperClassIds(
  showId: string,
  classIds: readonly string[]
): Promise<ReadonlySet<string>> {
  const [show, classes] = await Promise.all([
    replicatedShowsTable.getShowById(showId),
    Promise.all(classIds.map(id => replicatedClassesTable.getClassById(id))),
  ]);
  const paper = new Set<string>();
  for (const cls of classes) {
    if (cls && classScoresOnPaper(cls.scoresOnPaper, show?.usesDeviceScoring)) paper.add(cls.id);
  }
  return paper;
}

export function useOwnEntryClaims(
  showId: string | undefined,
  entries: readonly OwnableEntry[],
  ownEntryIds: ReadonlySet<string>
): ReadonlyMap<string, QueueClaim> {
  const own = useMemo(
    () => entries.filter(entry => ownEntryIds.has(entry.id)),
    [entries, ownEntryIds]
  );
  const ownIds = useMemo(() => own.map(entry => entry.id), [own]);
  const classIds = useMemo(() => [...new Set(own.map(entry => entry.classId))].sort(), [own]);
  const places = useMyEntryQueuePlaces(ownIds);

  const { data: paperClassIds } = useQuery({
    queryKey: ['at-show', 'paper-classes', showId, classIds.join(',')],
    queryFn: () => readPaperClassIds(showId as string, classIds),
    enabled: !!showId && classIds.length > 0,
    // Reads IndexedDB: it must run offline, which is the point (see MYK9-200).
    networkMode: 'always',
  });

  return useMemo(() => {
    const claims = new Map<string, QueueClaim>();
    for (const entry of own) {
      const answer = places.get(entry.id);
      if (answer) claims.set(entry.id, answer.claim);
      else if (paperClassIds?.has(entry.classId)) claims.set(entry.id, 'paper');
    }
    return claims;
  }, [own, places, paperClassIds]);
}
