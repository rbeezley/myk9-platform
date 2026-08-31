import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';

interface OrganizationAgreement {
  organization: string;
  agreement_text: string;
}

// Bypass generated types for table added in migration 122 (not yet in codegen)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untypedSupabase = supabase as any;

export const useOrganizationAgreement = (organization: string) => {
  return useQuery({
    queryKey: queryKeys.organizationAgreement(organization),
    // maybeSingle, not single. Only 'AKC' is seeded (migration 122), so for a
    // UKC or ASCA show `.single()` threw PGRST116 — "no rows" arrived as a
    // QUERY FAILURE, indistinguishable from the network being down. The entry
    // step then blocked forever behind a Retry that re-threw every time.
    // A missing row is now `null`: there is no agreement to present, which is a
    // configuration fact, not an error.
    queryFn: async (): Promise<OrganizationAgreement | null> => {
      const { data, error } = await untypedSupabase
        .from('organization_agreements')
        .select('organization, agreement_text')
        .eq('organization', organization)
        .maybeSingle();

      if (error) throw error;
      return data ?? null;
    },
    enabled: !!organization,
    ...cacheStrategies.static,
  });
};
