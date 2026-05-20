// ========================================
// MEDICATIONS
// ========================================

import { supabase } from '../supabaseClient';
import { wrapQuery, wrapMutation } from '../_shared/wrap-query';
import type { Database } from '@/types/supabase';

type DbMedicationRow = Database['public']['Tables']['medications']['Row'];
export type DbMedicationInsert = Database['public']['Tables']['medications']['Insert'];
export type DbMedicationUpdate = Database['public']['Tables']['medications']['Update'];

export const getAllMedications = (dogId?: string) =>
  wrapQuery('medication', 'select_all', [] as DbMedicationRow[], () => {
    let query = supabase
      .from('medications')
      .select('*')
      .order('start_date', { ascending: false });
    if (dogId) query = query.eq('dog_id', dogId);
    return query;
  });

export const getActiveMedications = (dogId?: string) =>
  wrapQuery('medication', 'select_active', [] as DbMedicationRow[], () => {
    let query = supabase
      .from('medications')
      .select('*')
      .eq('is_active', true)
      .order('start_date', { ascending: false });
    if (dogId) query = query.eq('dog_id', dogId);
    return query;
  });

export const createMedication = (medication: DbMedicationInsert) =>
  wrapQuery('medication', 'insert', null as DbMedicationRow | null, () =>
    supabase.from('medications').insert(medication).select().single()
  );

export const updateMedication = (id: string, updates: DbMedicationUpdate) =>
  wrapQuery('medication', 'update', null as DbMedicationRow | null, () =>
    supabase.from('medications').update(updates).eq('id', id).select().single()
  );

export const deleteMedication = (id: string) =>
  wrapMutation('medication', 'delete', () =>
    supabase.from('medications').delete().eq('id', id)
  );
