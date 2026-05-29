/**
 * useAtShowClassList — React Query hook for the at-show ClassList page.
 *
 * Returns a show's trials + classes (as ringside `ClassEntry`s) plus the show's
 * organization (needed by `findPairedSectionedClass` to decide A/B pairing).
 */

import { useQuery } from '@tanstack/react-query';
import { replicatedShowsTable } from '@/services/replication';
import { fetchAtShowClassList, type AtShowClassGroup } from './atShowClassListAdapter';

export interface UseAtShowClassListResult {
  groups: AtShowClassGroup[];
  organization: string;
  showName: string;
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useAtShowClassList(showId: string | undefined): UseAtShowClassListResult {
  const groupsQuery = useQuery({
    queryKey: ['at-show', 'classlist', showId],
    queryFn: () => fetchAtShowClassList(showId as string),
    enabled: !!showId,
  });
  const showQuery = useQuery({
    queryKey: ['at-show', 'show', showId],
    queryFn: () => replicatedShowsTable.getShowById(showId as string),
    enabled: !!showId,
  });

  return {
    groups: groupsQuery.data ?? [],
    organization: showQuery.data?.organization ?? '',
    showName: showQuery.data?.name ?? '',
    isLoading: groupsQuery.isLoading,
    error: (groupsQuery.error as Error | null) ?? null,
    refresh: () => void groupsQuery.refetch(),
  };
}
