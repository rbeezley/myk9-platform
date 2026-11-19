import { useMutation } from '@tanstack/react-query';
import type { GeneratedPremium } from '../../types/premium-types';
import { fetchPremium } from './fetchPremium';

interface UseGeneratePremiumResult {
  generate: (showId: string) => Promise<GeneratedPremium>;
  isLoading: boolean;
  error: string | null;
  reset: () => void;
}

export function useGeneratePremium(): UseGeneratePremiumResult {
  const mutation = useMutation<GeneratedPremium, Error, string>({
    mutationFn: async (showId: string) => {
      return fetchPremium(showId);
    },
  });

  return {
    generate: mutation.mutateAsync,
    isLoading: mutation.isPending,
    error: mutation.error?.message ?? null,
    reset: mutation.reset,
  };
}
