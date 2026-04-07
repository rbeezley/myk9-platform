import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';

interface OrganizationAgreement {
  organization: string;
  agreement_text: string;
}

export const useOrganizationAgreement = (organization: string) => {
  return useQuery({
    queryKey: queryKeys.organizationAgreement(organization),
    queryFn: async (): Promise<OrganizationAgreement> => {
      const { data, error } = await supabase
        .from('organization_agreements')
        .select('organization, agreement_text')
        .eq('organization', organization)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!organization,
    ...cacheStrategies.static,
  });
};
