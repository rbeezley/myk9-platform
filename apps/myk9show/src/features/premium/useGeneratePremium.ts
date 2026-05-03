import { useState } from 'react';
import { supabase } from '../../services/database/supabaseClient';
import type { GeneratedPremium } from '../../types/premium-types';

interface UseGeneratePremiumResult {
  generate: (showId: string) => Promise<GeneratedPremium>;
  isLoading: boolean;
  error: string | null;
  reset: () => void;
}

export function useGeneratePremium(): UseGeneratePremiumResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setError(null);
  }

  async function generate(showId: string): Promise<GeneratedPremium> {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('generate-premium', {
        body: { show_id: showId },
      });
      if (fnError) throw new Error(fnError.message);
      return data as GeneratedPremium;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate premium';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }

  return { generate, isLoading, error, reset };
}
