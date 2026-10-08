/**
 * Hook for fetching judges with their qualifications.
 * Used by ShowEditForm's Judges tab for judge assignment.
 */

import { useQuery } from '@tanstack/react-query';
import { getJudgesWithQualifications } from '@/services/database/judges';
import { mapDatabaseToUser } from '@/services/mappers/userMappers';

export const useJudgesWithQualifications = (enabled = true) => {
  return useQuery({
    queryKey: ['judges', 'withQualifications'],
    queryFn: async () => {
      const { data, error } = await getJudgesWithQualifications();
      if (error) throw error;
      return data.map(mapDatabaseToUser);
    },
    staleTime: 5 * 60 * 1000,
    // Refetch whenever the window regains focus, even inside staleTime: the Edit
    // Show judge warning links to a judge record in another tab, and the
    // qualification added there must show when the secretary returns.
    refetchOnWindowFocus: 'always',
    enabled,
  });
};
