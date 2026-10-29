/**
 * MYK9-1473: which classes still owe a coin flip, and who tied. Asked of the server only for the
 * classes that could owe one (complete, saved as completed, not yet checked) and only by someone
 * who runs the show (the RPC is show managers only). Never polled: it re-reads when the class's
 * check state or scores move (the row stops being a candidate once checked) or after a flip.
 * Offline it asks nothing, and a list read earlier in the session still stands.
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

export function useClassTies(showId: string, rows: readonly ResultsClassRow[]) {
  const online = useIsOnline();
  const scope = useShowManageScope(showId);
  const mayRead = scope.status === 'resolved' && scope.canOperate;
  const candidateIds = useMemo(
    () => (mayRead ? rows.filter(rowOwesTieCheck).map(row => row.id) : []),
    [mayRead, rows]
  );
  // A stable function, or the combined map is rebuilt on every render.
  const combine = useCallback(
    (results: { data: ClassTieGroup[] | undefined }[]) => {
      const byClass = new Map<string, ClassTieGroup[]>();
      results.forEach((result, index) => {
        const groups = result.data;
        const classId = candidateIds[index];
        if (classId && groups && groups.length > 0) byClass.set(classId, groups);
      });
      return byClass;
    },
    [candidateIds]
  );
  const ties = useQueries({
    queries: candidateIds.map(classId => ({
      queryKey: queryKeys.classTies(showId, classId),
      queryFn: () => readClassTies(classId),
      enabled: online,
      refetchOnWindowFocus: false,
      refetchInterval: false as const,
    })),
    combine,
  });
  return candidateIds.length === 0 ? NO_TIES : ties;
}
