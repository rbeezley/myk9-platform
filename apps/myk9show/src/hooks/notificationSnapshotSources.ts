import { supabase } from '@/lib/supabase';

// MYK9-1306: the snapshot is read over PostgREST only. The local replica is not
// read because nothing tells the monitor that a show's replica is whole and fresh
// without syncing it, and the monitor must never sync: it also mounts on account
// surfaces, which deliberately never seed show replicas. Classes would stay on
// PostgREST regardless, since the replica spells status `in_progress` where the
// processor compares `'In Progress'`.

/** Every class of the shows, with the id of each class's trial's show. */
export async function fetchClassRows(showIds: string[]): Promise<unknown[]> {
  const { data, error } = await supabase
    .from('classes')
    .select(
      `id, name, status, is_scoring_finalized, results_released_at,
         trial:trials!inner(show_id)`
    )
    .in('trial.show_id', showIds);
  if (error) throw error;
  return data ?? [];
}

/** Every entry in the given classes, from the authenticated entry-results view. */
export async function fetchEntryRowsByClass(classIds: string[]): Promise<unknown[]> {
  const { data, error } = await supabase
    .from('view_authenticated_entry_results')
    .select(
      `id, dog_id, class_id, show_id, check_in_status, armband, is_scored, result_status,
         dog_call_name`
    )
    .in('class_id', classIds);
  if (error) throw error;
  return data ?? [];
}

export async function fetchNotificationSnapshot(
  showIds: string[]
): Promise<{ entries: unknown[]; classes: unknown[] }> {
  const classes = await fetchClassRows(showIds);
  if (classes.length === 0) return { entries: [], classes };
  const classIds = classes.map(row => (row as { id: string }).id);
  return { entries: await fetchEntryRowsByClass(classIds), classes };
}
