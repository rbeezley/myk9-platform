import { useMutation } from '@tanstack/react-query';
import type { GeneratedPremium } from '../../types/premium-types';
import { fetchPremium } from './fetchPremium';

interface UseGeneratePremiumResult {
  generate: (showId: string) => Promise<GeneratedPremium>;
  isLoading: boolean;
  error: string | null;
  reset: () => void;
  /** The narratives built fresh from the show's facts, ignoring any published text. */
  rebuildNarratives: (showId: string) => Promise<GeneratedPremium['narratives']>;
  isRebuilding: boolean;
}

export function useGeneratePremium(): UseGeneratePremiumResult {
  const mutation = useMutation<GeneratedPremium, Error, string>({
    mutationFn: async (showId: string) => {
      return fetchPremium(showId);
    },
  });

  const rebuild = useMutation<GeneratedPremium['narratives'], Error, string>({
    mutationFn: async (showId: string) =>
      (await fetchPremium(showId, { rebuildNarratives: true })).narratives,
  });

  return {
    rebuildNarratives: rebuild.mutateAsync,
    isRebuilding: rebuild.isPending,
    generate: mutation.mutateAsync,
    isLoading: mutation.isPending,
    error: mutation.error?.message ?? null,
    reset: mutation.reset,
  };
}
