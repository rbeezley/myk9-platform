import { useQuery } from '@tanstack/react-query';
import { fetchRecentPremiumGenerations } from '../../services/database/queries/premiumTemplateQueries';

export function useRecentPremiumGenerations(clubId: string, limit = 5) {
  return useQuery({
    queryKey: ['premium_generations_recent', clubId, limit] as const,
    queryFn: () => fetchRecentPremiumGenerations(clubId, limit),
    enabled: !!clubId,
  });
}
