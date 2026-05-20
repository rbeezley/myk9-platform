// ========================================
// ALLERGIES
// ========================================

import { supabase } from '../supabaseClient';
import { wrapQuery, wrapMutation } from '../_shared/wrap-query';
import type { Database } from '@/types/supabase';

type DbAllergyRow = Database['public']['Tables']['allergies']['Row'];
export type DbAllergyInsert = Database['public']['Tables']['allergies']['Insert'];
export type DbAllergyUpdate = Database['public']['Tables']['allergies']['Update'];

export const getAllAllergies = (dogId?: string) =>
  wrapQuery('allergy', 'select_all', [] as DbAllergyRow[], () => {
    let query = supabase
      .from('allergies')
      .select('*')
      .order('diagnosed_date', { ascending: false, nullsFirst: false });
    if (dogId) query = query.eq('dog_id', dogId);
    return query;
  });

export const getActiveAllergies = (dogId?: string) =>
  wrapQuery('allergy', 'select_active', [] as DbAllergyRow[], () => {
    let query = supabase
      .from('allergies')
      .select('*')
      .order('severity', { ascending: false, nullsFirst: false });
    if (dogId) query = query.eq('dog_id', dogId);
    return query;
  });

export const createAllergy = (allergy: DbAllergyInsert) =>
  wrapQuery('allergy', 'insert', null as DbAllergyRow | null, () =>
    supabase.from('allergies').insert(allergy).select().single()
  );

export const updateAllergy = (id: string, updates: DbAllergyUpdate) =>
  wrapQuery('allergy', 'update', null as DbAllergyRow | null, () =>
    supabase.from('allergies').update(updates).eq('id', id).select().single()
  );

export const deleteAllergy = (id: string) =>
  wrapMutation('allergy', 'delete', () => supabase.from('allergies').delete().eq('id', id));
