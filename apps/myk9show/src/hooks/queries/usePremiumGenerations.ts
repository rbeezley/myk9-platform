import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchRecentPremiumGenerations,
  insertPremiumGeneration,
} from '../../services/database/queries/premiumTemplateQueries';
import type { PremiumGeneration } from '../../types/premium-types';

export function useRecentPremiumGenerations(clubId: string, limit = 5) {
  return useQuery({
    queryKey: ['premium_generations_recent', clubId, limit] as const,
    queryFn: () => fetchRecentPremiumGenerations(clubId, limit),
    enabled: !!clubId,
  });
}

export function useLogPremiumGeneration(clubId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (gen: Omit<PremiumGeneration, 'id' | 'generatedAt'>) =>
      insertPremiumGeneration(gen),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['premium_generations_recent', clubId] }),
  });
}
