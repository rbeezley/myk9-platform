import { useMutation } from '@tanstack/react-query';
import { supabase } from '../../services/database/supabaseClient';
import type { GeneratedPremium } from '../../types/premium-types';
import { classifyPremiumFunctionError } from './premiumPublishErrors';
import { parseGeneratedPremium } from './premiumPublishSchema';

const GENERATION_FAILURE_MESSAGE = "We couldn't generate the premium list. Please try again.";

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
      if (fnError) {
        console.error('[premium-generation] request failed', { showId, error: fnError });
        const classified = await classifyPremiumFunctionError(fnError, 'generation');
        if (classified.code === 'unknown') {
          throw new Error(GENERATION_FAILURE_MESSAGE);
        }
        throw classified;
      }
      try {
        return parseGeneratedPremium(data);
      } catch (error) {
        console.error('[premium-generation] invalid response shape', { showId, error });
        throw error;
      }
    },
  });

  return {
    generate: mutation.mutateAsync,
    isLoading: mutation.isPending,
    error: mutation.error?.message ?? null,
    reset: mutation.reset,
  };
}
