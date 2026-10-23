// The two reads the ring-proximity trigger can start before it knows anything
// else: the class queue and the class name depend only on `classId`, so they
// run together (MYK9-1372). Everything after them is sequential because each
// step needs the previous result: favorites need the queue's armbands,
// preferences need the candidate user ids.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';

export const DEFAULT_CLASS_NAME = 'your class';

export async function fetchQueueAndClassName(supabase: SupabaseClient, classId: string) {
  const [{ data: entryRows, error: entriesError }, { data: classRow }] = await Promise.all([
    // Whole class queue: the dogs-ahead index is only meaningful against every
    // entry, not just the watched ones.
    supabase
      .from('entries')
      .select(
        'id, dog_id, armband, run_order, is_scored, check_in_status, dog:dogs(call_name, owner:people!owner_id(auth_user_id), co_owner:people!co_owner_id(auth_user_id)), handler:people!handler_id(auth_user_id)'
      )
      .eq('class_id', classId)
      .is('deleted_at', null)
      .not('entry_status', 'in', '("withdrawn","scratched","absent")'),
    supabase.from('classes').select('name').eq('id', classId).single(),
  ]);

  return {
    entryRows,
    entriesError,
    // A failed name read only degrades the alert copy; it never blocks the send.
    className: (classRow as { name?: string } | null)?.name ?? DEFAULT_CLASS_NAME,
  };
}
