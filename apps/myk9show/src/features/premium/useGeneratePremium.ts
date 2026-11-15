import { useMutation } from '@tanstack/react-query';
import { supabase } from '../../services/database/supabaseClient';
import type { GeneratedPremium } from '../../types/premium-types';
import { fetchShowClubOfficers } from '@/services/database/club-memberships/officers';
import { fetchShowCommittee } from '@/services/database/club-memberships/committee';
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
        const premium = parseGeneratedPremium(data);
        // MYK9-2045: the club's Officers list rides along with the generated facts. A failed
        // read prints no officers rather than blocking the premium; the next generation retries.
        const officers = await fetchShowClubOfficers(showId);
        if (!officers) console.error('[premium-generation] officers read failed', { showId });
        // MYK9-2064: so does the Event Committee (the show's own list, else the club's), with
        // the same failure rule.
        const committee = await fetchShowCommittee(showId);
        if (!committee) console.error('[premium-generation] committee read failed', { showId });
        return {
          ...premium,
          ...(officers ? { officers } : {}),
          ...(committee ? { committee } : {}),
        };
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
