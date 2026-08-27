/**
 * useAtShowClassList — React Query hook for the at-show ClassList page.
 *
 * Returns a show's trials + classes (as ringside `ClassEntry`s) plus the show's
 * organization (needed by `findPairedSectionedClass` to decide A/B pairing).
 */

import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  replicatedClassesTable,
  replicatedEntriesTable,
  replicatedShowsTable,
  replicatedTrialsTable,
} from '@/services/replication';
import { fetchAtShowClassList, type AtShowClassGroup } from './atShowClassListAdapter';
import type { AtShowNextUpPreview } from './atShowNextUpPreview';

export interface UseAtShowClassListResult {
  groups: AtShowClassGroup[];
  /** In-ring / next-up row previews across every trial, keyed by class id. */
  nextUpByClassId: Map<string, AtShowNextUpPreview>;
  organization: string;
  showName: string;
  /** Owning club, needed to match the show-desk route's club-scoped gate. */
  clubId: string | undefined;
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useAtShowClassList(showId: string | undefined): UseAtShowClassListResult {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!showId) return;
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: ['at-show', 'classlist', showId] });
    };
    const unsubscribe = [
      replicatedClassesTable.subscribe(invalidate),
      replicatedTrialsTable.subscribe(invalidate),
      replicatedEntriesTable.subscribe(invalidate),
    ];
    return () => unsubscribe.forEach(stop => stop());
  }, [queryClient, showId]);

  const groupsQuery = useQuery({
    queryKey: ['at-show', 'classlist', showId],
    queryFn: () => fetchAtShowClassList(showId as string),
    enabled: !!showId,
    // Reads IndexedDB, so it must run without a network. The default "online"
    // mode PAUSES the queryFn offline, which leaves `isLoading` false and the
    // data undefined -- the page then renders "no classes" as a fact about the
    // show rather than about the connection. Matches RingsideShowBoundary and
    // the ringside EntryList, which already set this for the same reason.
    networkMode: 'always',
  });
  const showQuery = useQuery({
    queryKey: ['at-show', 'show', showId],
    queryFn: () => replicatedShowsTable.getShowById(showId as string),
    enabled: !!showId,
    networkMode: 'always',
  });

  // Keyed off the query data (not a `?? []` fallback) so the merged map keeps a
  // stable identity across renders where nothing refetched.
  const groupsData = groupsQuery.data;
  const groups = useMemo(() => groupsData ?? [], [groupsData]);
  const nextUpByClassId = useMemo(() => {
    const merged = new Map<string, AtShowNextUpPreview>();
    for (const group of groups) {
      for (const [classId, preview] of group.nextUpByClassId) merged.set(classId, preview);
    }
    return merged;
  }, [groups]);

  return {
    groups,
    nextUpByClassId,
    organization: showQuery.data?.organization ?? '',
    showName: showQuery.data?.name ?? '',
    clubId: showQuery.data?.clubId ?? undefined,
    // Gate on BOTH queries: `organization` drives A/B pairing, so the page must
    // not group/render with the default ('') before the show metadata lands.
    isLoading: groupsQuery.isLoading || showQuery.isLoading,
    error: (groupsQuery.error as Error | null) ?? (showQuery.error as Error | null) ?? null,
    // Refetch both queries: `error` surfaces whichever failed, so a retry
    // that only refetched groups would no-op on a show-metadata failure.
    refresh: () => {
      void groupsQuery.refetch();
      void showQuery.refetch();
    },
  };
}
