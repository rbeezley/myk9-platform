import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createClubPremiumTemplate,
  deleteClubPremiumTemplate,
  getClubPremiumTemplates,
  updateClubPremiumTemplate,
} from '@/services/database/premium-templates';
import type { ClubPremiumTemplate } from '../../types/premium-types';

const key = (clubId: string) => ['club_premium_templates', clubId] as const;

export function useClubPremiumTemplates(clubId: string) {
  return useQuery({
    queryKey: key(clubId),
    queryFn: () => getClubPremiumTemplates(clubId),
    enabled: !!clubId,
  });
}

export function useCreatePremiumTemplate(clubId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<ClubPremiumTemplate, 'id' | 'createdAt' | 'updatedAt'>) =>
      createClubPremiumTemplate(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(clubId) }),
  });
}

export function useUpdatePremiumTemplate(clubId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Omit<ClubPremiumTemplate, 'id' | 'clubId' | 'createdAt' | 'updatedAt'>>;
    }) => updateClubPremiumTemplate(id, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(clubId) }),
  });
}

export function useDeletePremiumTemplate(clubId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteClubPremiumTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(clubId) }),
  });
}
