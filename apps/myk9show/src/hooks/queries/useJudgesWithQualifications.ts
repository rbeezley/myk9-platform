/**
 * Hook for fetching judges with their qualifications.
 * Used by ShowEditForm's Judges tab for judge assignment.
 */

import { useQuery } from '@tanstack/react-query';
import { getJudgesWithQualifications } from '@/services/database/queries/userQueries';
import { mapDatabaseToUser } from '@/services/mappers/userMappers';

export const useJudgesWithQualifications = () => {
  return useQuery({
    queryKey: ['judges', 'withQualifications'],
    queryFn: async () => {
      const { data, error } = await getJudgesWithQualifications();
      if (error) throw error;
      return data.map(mapDatabaseToUser);
    },
    staleTime: 5 * 60 * 1000,
  });
};
