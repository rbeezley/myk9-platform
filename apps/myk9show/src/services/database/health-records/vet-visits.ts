// ========================================
// VET VISITS
// ========================================

import { supabase } from '../supabaseClient';
import { wrapQuery, wrapMutation } from '../_shared/wrap-query';
import type { Database } from '@/types/supabase';

type DbVetVisitRow = Database['public']['Tables']['vet_visits']['Row'];
export type DbVetVisitInsert = Database['public']['Tables']['vet_visits']['Insert'];
export type DbVetVisitUpdate = Database['public']['Tables']['vet_visits']['Update'];

export const getAllVetVisits = (dogId?: string) =>
  wrapQuery('vet_visit', 'select_all', [] as DbVetVisitRow[], () => {
    let query = supabase
      .from('vet_visits')
      .select('*')
      .order('visit_date', { ascending: false });
    if (dogId) query = query.eq('dog_id', dogId);
    return query;
  });

export const getVetVisitsRequiringFollowUp = (dogId?: string) =>
  wrapQuery('vet_visit', 'select_follow_up', [] as DbVetVisitRow[], () => {
    let query = supabase
      .from('vet_visits')
      .select('*')
      .not('follow_up_date', 'is', null)
      .order('follow_up_date', { ascending: true, nullsFirst: false });
    if (dogId) query = query.eq('dog_id', dogId);
    return query;
  });

export const createVetVisit = (vetVisit: DbVetVisitInsert) =>
  wrapQuery('vet_visit', 'insert', null as DbVetVisitRow | null, () =>
    supabase.from('vet_visits').insert(vetVisit).select().single()
  );

export const updateVetVisit = (id: string, updates: DbVetVisitUpdate) =>
  wrapQuery('vet_visit', 'update', null as DbVetVisitRow | null, () =>
    supabase.from('vet_visits').update(updates).eq('id', id).select().single()
  );

export const deleteVetVisit = (id: string) =>
  wrapMutation('vet_visit', 'delete', () => supabase.from('vet_visits').delete().eq('id', id));
