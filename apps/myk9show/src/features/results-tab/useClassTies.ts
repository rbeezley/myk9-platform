/**
 * MYK9-1473: which classes still owe a coin flip, and who tied. Asked of the server only for the
 * classes that could owe one (complete, saved as completed, not yet checked) and only by someone
 * who runs the show (the RPC is show managers only). Never polled: it re-reads when the class's
 * check state or scores move (the row stops being a candidate once checked; the key carries a
 * stamp of the displayed results, so a score correction asks again) or after a flip. Offline it
 * asks nothing, and a list read earlier in the session still stands. A failed read is reported
 * (`failed`) and can be retried (`refetch`), never taken for "no ties".
 */
import { useCallback, useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';

import { readClassTies, type ClassTieGroup } from '@/features/show-map/classTiesMutations';
import { useIsOnline } from '@/hooks/useNetworkStatus';
import { useShowManageScope } from '@/hooks/useShowManageScope';
import { queryKeys } from '@/lib/queryClient';
import type { ResultsClassRow } from './buildResultsClassRows';
import { rowOwesTieCheck } from './coinFlipRows';

const NO_TIES: ReadonlyMap<string, ClassTieGroup[]> = new Map();
const NO_RESULT = { byClass: NO_TIES, failed: false, refetch: () => {} };

export interface ClassTies {
  byClass: ReadonlyMap<string, ClassTieGroup[]>;
  /** A tie read failed: a class may owe a coin flip this tab could not see. */
  failed: boolean;
  refetch: () => void;
}

/** A short stamp of the displayed results, so the tie list is asked again when they change. */
function resultsStamp(canonical: string | null): string {
  if (canonical === null) return 'none';
  let hash = 5381;
  for (let i = 0; i < canonical.length; i += 1) hash = (hash * 33 + canonical.charCodeAt(i)) | 0;
  return `${canonical.length}:${(hash >>> 0).toString(36)}`;
}

export function useClassTies(showId: string, rows: readonly ResultsClassRow[]): ClassTies {
  const online = useIsOnline();
  const scope = useShowManageScope(showId);
  const mayRead = scope.status === 'resolved' && scope.canOperate;
  const candidates = useMemo(
    () =>
      mayRead
        ? rows
            .filter(rowOwesTieCheck)
            .map(row => ({ id: row.id, stamp: resultsStamp(row.resultsCanonical) }))
        : [],
    [mayRead, rows]
  );
  const candidateIds = useMemo(() => candidates.map(candidate => candidate.id), [candidates]);
  // A stable function, or the combined result is rebuilt on every render.
  const combine = useCallback(
    (
      results: { data: ClassTieGroup[] | undefined; isError: boolean; refetch: () => unknown }[]
    ) => {
      const byClass = new Map<string, ClassTieGroup[]>();
      results.forEach((result, index) => {
        const groups = result.data;
        const classId = candidateIds[index];
        if (classId && groups && groups.length > 0) byClass.set(classId, groups);
      });
      return {
        byClass,
        failed: results.some(result => result.isError),
        refetch: () => {
          results.forEach(result => {
            if (result.isError) void result.refetch();
          });
        },
      };
    },
    [candidateIds]
  );
  const ties = useQueries({
    queries: candidates.map(({ id, stamp }) => ({
      queryKey: [...queryKeys.classTies(showId, id), stamp] as const,
      queryFn: () => readClassTies(id),
      enabled: online,
      refetchOnWindowFocus: false,
      refetchInterval: false as const,
    })),
    combine,
  });
  return candidates.length === 0 ? NO_RESULT : ties;
}
