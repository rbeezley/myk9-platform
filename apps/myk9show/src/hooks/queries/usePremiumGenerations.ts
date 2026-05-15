import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getRecentPremiumGenerations,
  insertPremiumGeneration,
} from '@/services/database/premium-templates';
import type { PremiumGeneration } from '../../types/premium-types';

export function useRecentPremiumGenerations(clubId: string, limit = 5) {
  return useQuery({
    queryKey: ['premium_generations_recent', clubId, limit] as const,
    queryFn: () => getRecentPremiumGenerations(clubId, limit),
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
