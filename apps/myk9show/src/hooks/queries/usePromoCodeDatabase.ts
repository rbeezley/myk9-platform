// React Query hooks for promo code database operations

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import {
  getPromoCodesByTrial,
  createPromoCode,
  deletePromoCode,
  incrementPromoCodeUsage,
} from '@/services/database/queries/promoCodeQueries';
import { mapDbPromoCodeToApp, mapAppPromoCodeToDbInsert } from '@/services/mappers/promoCodeMappers';
import type { PromoCodeFormData } from '@/types/promo-codes';

// List promo codes for a trial
export const usePromoCodesByTrialQuery = (trialId: string) => {
  return useQuery({
    queryKey: queryKeys.trialPromoCodes(trialId),
    queryFn: async () => {
      const { data, error } = await getPromoCodesByTrial(trialId);
      if (error) throw error;
      return data.map(mapDbPromoCodeToApp);
    },
    enabled: !!trialId,
    ...cacheStrategies.moderate,
  });
};

// Create promo code
export const useCreatePromoCodeMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      form,
      trialId,
      createdBy,
    }: {
      form: PromoCodeFormData;
      trialId: string;
      createdBy: string;
    }) => {
      const dbInsert = mapAppPromoCodeToDbInsert(form, trialId, createdBy);
      const { data, error } = await createPromoCode(dbInsert);
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.trialPromoCodes(variables.trialId),
      });
    },
  });
};

// Delete promo code
export const useDeletePromoCodeMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, trialId }: { id: string; trialId: string }) => {
      const { error } = await deletePromoCode(id);
      if (error) throw error;
      return trialId;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.trialPromoCodes(variables.trialId),
      });
    },
  });
};

// Increment usage (for checkout flow)
export const useIncrementPromoCodeUsageMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, trialId }: { id: string; trialId: string }) => {
      const { error } = await incrementPromoCodeUsage(id);
      if (error) throw error;
      return trialId;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.trialPromoCodes(variables.trialId),
      });
    },
  });
};
