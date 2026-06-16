/**
 * Public (anonymous) entry reads.
 *
 * Logged-out visitors hit public routes (`/shows/:id`, `/trials/:trialId`,
 * `/shows/.../classes/:classId`, `/tv/:showId`). They must NOT be able to read
 * withheld scored columns or PII. Migration 20260616120000 revokes anon's broad
 * SELECT on `entries` and exposes a safe, cascade-aware view instead:
 * `view_public_entry_results`. Scored columns (final_placement, result_status,
 * search_time_seconds, total_score, total_faults, result_text) arrive already
 * NULLed by the database when the per-field visibility cascade hides them, and
 * payment/PII columns are simply absent.
 *
 * These functions are the anon counterpart of the `getEntriesBy*` reads in
 * `reads.ts`. Authenticated callers keep using `reads.ts` (full table access,
 * still governed by RLS) — only the anon branch routes here.
 */

import { supabase, createDatabaseError } from '../supabaseClient';

/** A row from `view_public_entry_results`. Scored columns are NULL when withheld. */
export interface PublicEntryRow {
  id: string;
  class_id: string | null;
  trial_id: string | null;
  show_id: string | null;
  dog_id: string | null;
  armband: string | null;
  handler: string | null;
  run_order: number | null;
  is_in_ring: boolean | null;
  is_scored: boolean | null;
  check_in_status: string | null;
  entry_status: string | null;
  scoring_completed_at: string | null;
  created_at: string | null;
  final_placement: number | null;
  result_status: string | null;
  search_time_seconds: number | null;
  total_score: number | null;
  total_faults: number | null;
  result_text: string | null;
  dog_name: string | null;
  dog_call_name: string | null;
  dog_breed: string | null;
  dog_image_url: string | null;
  class_name: string | null;
  class_level: string | null;
  class_element: string | null;
  class_results_released_at: string | null;
}

const PUBLIC_ENTRY_COLUMNS =
  'id, class_id, trial_id, show_id, dog_id, armband, handler, run_order, is_in_ring, is_scored, ' +
  'check_in_status, entry_status, scoring_completed_at, created_at, final_placement, result_status, ' +
  'search_time_seconds, total_score, total_faults, result_text, dog_name, dog_call_name, dog_breed, ' +
  'dog_image_url, class_name, class_level, class_element, class_results_released_at';

export async function getPublicEntriesByClass(classId: string) {
  const { data, error } = await supabase
    .from('view_public_entry_results')
    .select(PUBLIC_ENTRY_COLUMNS)
    .eq('class_id', classId)
    .order('run_order', { ascending: true, nullsFirst: false });

  if (error) throw createDatabaseError(error, 'view_public_entry_results', 'select_by_class');
  return { data: (data ?? []) as unknown as PublicEntryRow[], error: null };
}

export async function getPublicEntriesByShow(showId: string) {
  const { data, error } = await supabase
    .from('view_public_entry_results')
    .select(PUBLIC_ENTRY_COLUMNS)
    .eq('show_id', showId)
    .order('created_at', { ascending: false });

  if (error) throw createDatabaseError(error, 'view_public_entry_results', 'select_by_show');
  return { data: (data ?? []) as unknown as PublicEntryRow[], error: null };
}

export async function getPublicEntriesByTrial(trialId: string) {
  const { data, error } = await supabase
    .from('view_public_entry_results')
    .select(PUBLIC_ENTRY_COLUMNS)
    .eq('trial_id', trialId)
    .order('created_at', { ascending: false });

  if (error) throw createDatabaseError(error, 'view_public_entry_results', 'select_by_trial');
  return { data: (data ?? []) as unknown as PublicEntryRow[], error: null };
}
