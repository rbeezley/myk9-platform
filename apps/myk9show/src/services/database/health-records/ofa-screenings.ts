// ========================================
// OFA SCREENINGS
// ========================================

import { supabase } from '../supabaseClient';
import { wrapQuery, wrapMutation } from '../_shared/wrap-query';
import type { Database } from '@/types/supabase';

type DbOFAScreeningRow = Database['public']['Tables']['ofa_screenings']['Row'];
export type DbOFAScreeningInsert = Database['public']['Tables']['ofa_screenings']['Insert'];
export type DbOFAScreeningUpdate = Database['public']['Tables']['ofa_screenings']['Update'];

export const getAllOFAScreenings = (dogId?: string) =>
  wrapQuery('ofa_screening', 'select_all', [] as DbOFAScreeningRow[], () => {
    let query = supabase
      .from('ofa_screenings')
      .select('*')
      .order('test_date', { ascending: false });
    if (dogId) query = query.eq('dog_id', dogId);
    return query;
  });

export const getOFAScreeningById = (id: string) =>
  wrapQuery('ofa_screening', 'select_by_id', null as DbOFAScreeningRow | null, () =>
    supabase.from('ofa_screenings').select('*').eq('id', id).single()
  );

export const createOFAScreening = (screening: DbOFAScreeningInsert) =>
  wrapQuery('ofa_screening', 'insert', null as DbOFAScreeningRow | null, () =>
    supabase.from('ofa_screenings').insert(screening).select().single()
  );

export const updateOFAScreening = (id: string, updates: DbOFAScreeningUpdate) =>
  wrapQuery('ofa_screening', 'update', null as DbOFAScreeningRow | null, () =>
    supabase.from('ofa_screenings').update(updates).eq('id', id).select().single()
  );

export const deleteOFAScreening = (id: string) =>
  wrapMutation('ofa_screening', 'delete', () =>
    supabase.from('ofa_screenings').delete().eq('id', id)
  );
