import { useCallback, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { resolveClaim } from '@myk9/ringside/run-queue';
import {
  replicatedClassesTable,
  replicatedShowsTable,
  replicatedTrialsTable,
} from '@/services/replication';

/**
 * `paper`: scored on paper. `not-paper`: the claim is known and it is not paper. `unknown`: the
 * rows have not loaded (or the class is not on this device), so a surface claims nothing.
 */
export type PaperClaim = 'paper' | 'not-paper' | 'unknown';

type ClaimsByClassId = Readonly<Record<string, 'paper' | 'not-paper'>>;

const NO_CLAIMS: ClaimsByClassId = Object.freeze({});
const NO_PAPER: ReadonlySet<string> = new Set();

/** Reads only each show's `usesDeviceScoring` and its classes' `scoresOnPaper`: never an entry. */
async function loadPaperClaims(showIds: readonly string[]): Promise<ClaimsByClassId> {
  const result: Record<string, 'paper' | 'not-paper'> = {};
  await Promise.all(
    showIds.map(async showId => {
      try {
        const [show, trials] = await Promise.all([
          replicatedShowsTable.getShowById(showId),
          replicatedTrialsTable.getTrialsByShow(showId),
        ]);
        const classes = (
          await Promise.all(trials.map(trial => replicatedClassesTable.getClassesByTrial(trial.id)))
        ).flat();
        for (const cls of classes) {
          const claim = resolveClaim({
            classOnPaper: cls.scoresOnPaper ?? null,
            showUsesDeviceScoring: show?.usesDeviceScoring,
          });
          // A class that follows the show cannot be answered without the show row.
          if (cls.scoresOnPaper == null && !show) continue;
          result[cls.id] = claim === 'paper' ? 'paper' : 'not-paper';
        }
      } catch {
        // Unreadable replica: those classes stay unknown, which claims nothing.
      }
    })
  );
  return result;
}

/**
 * MYK9-1970: the one reader of the paper claim, for every surface. It answers through
 * `resolveClaim` from the replicated shows and classes only (never entries), so a phone that holds
 * the class answers offline, and re-reads when either table changes. `claimOf` and `paperClassIds`
 * change identity only when an answer changes, so cards do not re-render on every score.
 * Until the rows load, every class is `unknown`.
 */
export function usePaperClaims(showIds: readonly (string | undefined)[]) {
  const queryClient = useQueryClient();
  const ids = useMemo(
    () => [...new Set(showIds.filter((id): id is string => !!id))].sort(),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by content below
    [showIds.join('|')]
  );
  const queryKey = useMemo(() => ['paper-claims', ids.join('|')], [ids]);
  const enabled = ids.length > 0;
  const { data } = useQuery({
    queryKey,
    queryFn: () => loadPaperClaims(ids),
    enabled,
    // Offline is normal: the replicated rows are the whole answer.
    networkMode: 'always',
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!enabled) return;
    const invalidate = () => void queryClient.invalidateQueries({ queryKey });
    const unsubscribes = [
      replicatedClassesTable.subscribe(invalidate),
      replicatedShowsTable.subscribe(invalidate),
    ];
    return () => unsubscribes.forEach(unsubscribe => unsubscribe());
  }, [enabled, queryClient, queryKey]);

  const claims = data ?? NO_CLAIMS;
  const claimOf = useCallback(
    (classId: string | undefined, ownFlag?: boolean | null): PaperClaim => {
      if (ownFlag === true) return 'paper';
      if (ownFlag === false) return 'not-paper';
      return (classId && claims[classId]) || 'unknown';
    },
    [claims]
  );
  const paperClassIds = useMemo(() => {
    const paper = Object.keys(claims).filter(id => claims[id] === 'paper');
    return paper.length > 0 ? new Set(paper) : NO_PAPER;
  }, [claims]);
  return { claimOf, paperClassIds };
}
