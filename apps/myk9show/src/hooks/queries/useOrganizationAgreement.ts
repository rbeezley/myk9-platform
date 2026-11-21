import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import type { Tables } from '@/types/supabase';

type OrganizationAgreement = Pick<
  Tables<'organization_agreements'>,
  'organization' | 'agreement_text'
>;

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
      const { data, error } = await supabase
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
