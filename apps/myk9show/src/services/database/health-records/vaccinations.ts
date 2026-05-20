// ========================================
// VACCINATIONS
// ========================================

import { supabase } from '../supabaseClient';
import { wrapQuery, wrapMutation } from '../_shared/wrap-query';
import type { Database } from '@/types/supabase';

type DbVaccinationRow = Database['public']['Tables']['vaccinations']['Row'];
export type DbVaccinationInsert = Database['public']['Tables']['vaccinations']['Insert'];
export type DbVaccinationUpdate = Database['public']['Tables']['vaccinations']['Update'];

export const getAllVaccinations = (dogId?: string) =>
  wrapQuery('vaccination', 'select_all', [] as DbVaccinationRow[], () => {
    let query = supabase
      .from('vaccinations')
      .select('*')
      .order('date_administered', { ascending: false });
    if (dogId) query = query.eq('dog_id', dogId);
    return query;
  });

export const getVaccinationById = (id: string) =>
  wrapQuery('vaccination', 'select_by_id', null as DbVaccinationRow | null, () =>
    supabase.from('vaccinations').select('*').eq('id', id).single()
  );

export const createVaccination = (vaccination: DbVaccinationInsert) =>
  wrapQuery('vaccination', 'insert', null as DbVaccinationRow | null, () =>
    supabase.from('vaccinations').insert(vaccination).select().single()
  );

export const updateVaccination = (id: string, updates: DbVaccinationUpdate) =>
  wrapQuery('vaccination', 'update', null as DbVaccinationRow | null, () =>
    supabase.from('vaccinations').update(updates).eq('id', id).select().single()
  );

export const deleteVaccination = (id: string) =>
  wrapMutation('vaccination', 'delete', () =>
    supabase.from('vaccinations').delete().eq('id', id)
  );

// Get upcoming vaccinations (due within next 30 days)
export const getUpcomingVaccinations = (dogId?: string) => {
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  return wrapQuery('vaccination', 'select_upcoming', [] as DbVaccinationRow[], () => {
    let query = supabase
      .from('vaccinations')
      .select('*')
      .not('expiration_date', 'is', null)
      .lte('expiration_date', thirtyDaysFromNow.toISOString())
      .order('expiration_date', { ascending: true });
    if (dogId) query = query.eq('dog_id', dogId);
    return query;
  });
};
