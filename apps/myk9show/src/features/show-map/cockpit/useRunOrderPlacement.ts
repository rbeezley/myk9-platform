import { useQuery } from '@tanstack/react-query';

import { classPlacementKey, loadClassPlacement } from '../classPlacementSource';

/**
 * The dogs the run-order write will treat as waiting, in its order (`model.waiting`), read from
 * the replica the same way the write does (MYK9-1872). Null while loading or after a failed read,
 * so no grip is offered on a guess. Keyed under the class's entries, so every entry write
 * refreshes it.
 */
export function useRunOrderPlacement(showId: string, classId: string, enabled: boolean) {
  const query = useQuery({
    queryKey: classPlacementKey(showId, classId),
    queryFn: () => loadClassPlacement(showId, classId),
    networkMode: 'always',
    enabled,
  });
  return {
    waitingIds: query.data ? query.data.model.waiting.map(row => row.id) : null,
    isError: query.isError,
    retry: () => void query.refetch(),
  };
}
