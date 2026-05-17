import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';

async function fetchTrialRegistry(trialId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('trials')
    .select('registry_id')
    .eq('id', trialId)
    .single();
  if (error) throw error;
  return (data as { registry_id?: string | null } | null)?.registry_id ?? null;
}

/**
 * Returns the raw `trials.registry_id` string for a trial (e.g. "AKC").
 * Used by the supply-template seed path which keys directly off the
 * registry id. For richer registry metadata, use `getTrialRegistry`
 * from `@/features/registries` instead.
 */
export function useTrialRegistry(trialId: string | null | undefined) {
  return useQuery({
    queryKey: ['trial-registry', trialId ?? ''] as const,
    queryFn: () => fetchTrialRegistry(trialId!),
    enabled: !!trialId,
    staleTime: 5 * 60 * 1000,
  });
}
