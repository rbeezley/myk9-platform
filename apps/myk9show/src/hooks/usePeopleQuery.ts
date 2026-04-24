import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';

export interface PersonOption {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
}

export function usePeopleQuery(enabled = true) {
  return useQuery<PersonOption[]>({
    queryKey: ['people', 'all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('people')
        .select('id, first_name, last_name, email')
        .order('last_name')
        .limit(500);
      if (error) throw error;
      return (data ?? []).map(p => ({
        id: p.id,
        firstName: p.first_name,
        lastName: p.last_name,
        ...(p.email != null ? { email: p.email } : {}),
      }));
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}
