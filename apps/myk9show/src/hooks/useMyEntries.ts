/**
 * Stub hook for fetching the current user's entries for a given show.
 * Returns entries grouped by class with position data.
 *
 * TODO: Full implementation in Task 15 (Chunk 5) — will query Supabase
 * entries joined with classes and calculate dogsAhead.
 */
import { useMemo } from 'react';
import { useAuthContext } from '@/hooks/useAuthContext';

interface MyEntryByClass {
  classId: string;
  className: string;
  dogName: string;
  armband: string;
  runOrder: number;
  dogsAhead: number;
  scored: boolean;
}

interface UseMyEntriesResult {
  entries: Array<{ id: string; showId: string }>;
  entriesByClass: MyEntryByClass[];
  isLoading: boolean;
  isError: boolean;
}

export function useMyEntries(showId: string | undefined): UseMyEntriesResult {
  const { user } = useAuthContext();

  return useMemo(
    () => ({
      entries: [],
      entriesByClass: [],
      isLoading: false,
      isError: false,
    }),
    [user?.id, showId]
  );
}
