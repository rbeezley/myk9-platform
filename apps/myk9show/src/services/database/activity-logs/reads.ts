/**
 * Supabase queries for the activity_log table (generic record activity).
 */

import { supabase } from '../supabaseClient';
import type { Json } from '@/types/supabase';

export type ActivityRecordType = 'dog' | 'show' | 'trial' | 'person' | 'class';

export interface ActivityLogEntry {
  id: string;
  trial_id: string | null;
  record_type: ActivityRecordType | null;
  record_id: string | null;
  action_type: string;
  description: string;
  actor_id: string | null;
  actor_name: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ActivityLogInsert {
  record_type: ActivityRecordType;
  record_id: string;
  trial_id?: string;
  action_type: string;
  description: string;
  actor_name?: string;
  metadata?: Record<string, unknown>;
}

const PAGE_SIZE = 50;

/** Fetch paginated activity for a specific record. */
export async function getActivityForRecord(
  recordType: ActivityRecordType,
  recordId: string,
  page = 0
) {
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, error, count } = await supabase
    .from('activity_log')
    .select('*', { count: 'exact' })
    .eq('record_type', recordType)
    .eq('record_id', recordId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) return { data: null, count: 0, error: error as Error };
  return { data: data as ActivityLogEntry[], count: (count as number) ?? 0, error: null };
}

/** Insert a new activity log entry. */
export async function logActivity(entry: ActivityLogInsert) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from('activity_log').insert({
    ...entry,
    actor_id: user?.id ?? null,
    actor_name: entry.actor_name ?? (user?.user_metadata?.full_name as string) ?? null,
    metadata: (entry.metadata ?? {}) as Json,
  });

  if (error) return { error: error as Error };
  return { error: null };
}
