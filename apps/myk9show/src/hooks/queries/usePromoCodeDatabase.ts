// React Query hooks for promo code database operations

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import {
  getPromoCodesByTrial,
  getPromoCodesByShow,
  createPromoCode,
  deletePromoCode,
  incrementPromoCodeUsage,
} from '@/services/database/promo-codes';
import {
  mapDbPromoCodeToApp,
  mapAppPromoCodeToDbInsert,
} from '@/services/mappers/promoCodeMappers';
import type { PromoCodeFormData, PromoCodeTarget } from '@/types/promo-codes';

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

// List promo codes for a show (show-scoped only)
export const usePromoCodesByShowQuery = (showId: string) => {
  return useQuery({
    queryKey: queryKeys.showPromoCodes(showId),
    queryFn: async () => {
      const { data, error } = await getPromoCodesByShow(showId);
      if (error) throw error;
      return data.map(mapDbPromoCodeToApp);
    },
    enabled: !!showId,
    ...cacheStrategies.moderate,
  });
};

// Create promo code (show-scoped or trial-scoped)
export const useCreatePromoCodeMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      form,
      target,
      createdBy,
    }: {
      form: PromoCodeFormData;
      target: PromoCodeTarget;
      createdBy: string;
    }) => {
      const dbInsert = mapAppPromoCodeToDbInsert(form, target, createdBy);
      const { data, error } = await createPromoCode(dbInsert);
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      if (variables.target.showId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.showPromoCodes(variables.target.showId),
        });
      }
      if (variables.target.trialId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.trialPromoCodes(variables.target.trialId),
        });
      }
    },
  });
};

type PromoCodeMutationVars = { id: string; showId?: string; trialId?: string };

const invalidatePromoCodeCaches = (
  queryClient: ReturnType<typeof useQueryClient>,
  variables: PromoCodeMutationVars
) => {
  if (variables.showId) {
    queryClient.invalidateQueries({ queryKey: queryKeys.showPromoCodes(variables.showId) });
  }
  if (variables.trialId) {
    queryClient.invalidateQueries({ queryKey: queryKeys.trialPromoCodes(variables.trialId) });
  }
};

// Delete promo code
export const useDeletePromoCodeMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (vars: PromoCodeMutationVars) => {
      const { error } = await deletePromoCode(vars.id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => invalidatePromoCodeCaches(queryClient, variables),
  });
};

// Increment usage (for checkout flow)
export const useIncrementPromoCodeUsageMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (vars: PromoCodeMutationVars) => {
      const { error } = await incrementPromoCodeUsage(vars.id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => invalidatePromoCodeCaches(queryClient, variables),
  });
};
