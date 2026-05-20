// ========================================
// HEALTH RECORDS (Parent table)
// ========================================

import { supabase } from '../supabaseClient';
import { wrapQuery, wrapMutation } from '../_shared/wrap-query';
import type { Database } from '@/types/supabase';

type DbHealthRecordRow = Database['public']['Tables']['health_records']['Row'];
export type DbHealthRecordInsert = Database['public']['Tables']['health_records']['Insert'];
export type DbHealthRecordUpdate = Database['public']['Tables']['health_records']['Update'];

export const getAllHealthRecords = (dogId?: string) =>
  wrapQuery('health_record', 'select_all', [] as DbHealthRecordRow[], () => {
    let query = supabase
      .from('health_records')
      .select('*')
      .order('created_at', { ascending: false });
    if (dogId) query = query.eq('dog_id', dogId);
    return query;
  });

export const getHealthRecordById = (id: string) =>
  wrapQuery('health_record', 'select_by_id', null as DbHealthRecordRow | null, () =>
    supabase.from('health_records').select('*').eq('id', id).single()
  );

export const createHealthRecord = (healthRecord: DbHealthRecordInsert) =>
  wrapQuery('health_record', 'insert', null as DbHealthRecordRow | null, () =>
    supabase.from('health_records').insert(healthRecord).select().single()
  );

export const updateHealthRecord = (id: string, updates: DbHealthRecordUpdate) =>
  wrapQuery('health_record', 'update', null as DbHealthRecordRow | null, () =>
    supabase.from('health_records').update(updates).eq('id', id).select().single()
  );

export const deleteHealthRecord = (id: string) =>
  wrapMutation('health_record', 'delete', () =>
    supabase.from('health_records').delete().eq('id', id)
  );
