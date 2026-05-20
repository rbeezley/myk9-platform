// ========================================
// GENETIC SCREENINGS
// ========================================

import { supabase } from '../supabaseClient';
import { wrapQuery, wrapMutation } from '../_shared/wrap-query';
import type { Database } from '@/types/supabase';

type DbGeneticScreeningRow = Database['public']['Tables']['genetic_screenings']['Row'];
export type DbGeneticScreeningInsert =
  Database['public']['Tables']['genetic_screenings']['Insert'];
export type DbGeneticScreeningUpdate =
  Database['public']['Tables']['genetic_screenings']['Update'];

export const getAllGeneticScreenings = (dogId?: string) =>
  wrapQuery('genetic_screening', 'select_all', [] as DbGeneticScreeningRow[], () => {
    let query = supabase
      .from('genetic_screenings')
      .select('*')
      .order('test_date', { ascending: false });
    if (dogId) query = query.eq('dog_id', dogId);
    return query;
  });

export const getGeneticScreeningById = (id: string) =>
  wrapQuery('genetic_screening', 'select_by_id', null as DbGeneticScreeningRow | null, () =>
    supabase.from('genetic_screenings').select('*').eq('id', id).single()
  );

export const createGeneticScreening = (screening: DbGeneticScreeningInsert) =>
  wrapQuery('genetic_screening', 'insert', null as DbGeneticScreeningRow | null, () =>
    supabase.from('genetic_screenings').insert(screening).select().single()
  );

export const updateGeneticScreening = (id: string, updates: DbGeneticScreeningUpdate) =>
  wrapQuery('genetic_screening', 'update', null as DbGeneticScreeningRow | null, () =>
    supabase.from('genetic_screenings').update(updates).eq('id', id).select().single()
  );

export const deleteGeneticScreening = (id: string) =>
  wrapMutation('genetic_screening', 'delete', () =>
    supabase.from('genetic_screenings').delete().eq('id', id)
  );
