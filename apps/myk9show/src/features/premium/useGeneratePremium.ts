import { useMutation } from '@tanstack/react-query';
import { supabase } from '../../services/database/supabaseClient';
import type { GeneratedPremium } from '../../types/premium-types';

interface UseGeneratePremiumResult {
  generate: (showId: string) => Promise<GeneratedPremium>;
  isLoading: boolean;
  error: string | null;
  reset: () => void;
}

export function useGeneratePremium(): UseGeneratePremiumResult {
  const mutation = useMutation<GeneratedPremium, Error, string>({
    mutationFn: async (showId: string) => {
      const { data, error: fnError } = await supabase.functions.invoke('generate-premium', {
        body: { show_id: showId },
      });
      if (fnError) throw new Error(fnError.message);
      return data as GeneratedPremium;
    },
  });

  return {
    generate: mutation.mutateAsync,
    isLoading: mutation.isPending,
    error: mutation.error?.message ?? null,
    reset: mutation.reset,
  };
}
