// The two reads the ring-proximity trigger can start before it knows anything
// else: the class queue and the class name depend only on `classId`, so they
// run together (MYK9-1372). Everything after them is sequential because each
// step needs the previous result: favorites need the queue's armbands,
// preferences need the candidate user ids.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';

export const DEFAULT_CLASS_NAME = 'your class';

// MYK9-2412: a dog that is not yet approved is off the running line (MYK9-2391), so it is
// not a dog ahead. Mirrors `isPendingEntryStatus` (apps/myk9show/src/features/entry-operations/
// classEntryBreakdown.ts) and the SQL function `entry_queue_places_for_classes`; the Deno
// function cannot import app code, so keep the three in step. A null status is also excluded
// by the SQL `NOT IN` (NULL is never "not in" a list), and '' covers the blank no-status case.
export const PENDING_ENTRY_STATUSES = [
  'submitted',
  'pending',
  'draft',
  '',
  'pending-payment',
  'paid',
  'promotion-expired',
] as const;

export const EXCLUDED_QUEUE_STATUSES = [
  'withdrawn',
  'scratched',
  'absent',
  ...PENDING_ENTRY_STATUSES,
] as const;

interface ClassPaperRow {
  scores_on_paper?: boolean | null;
  trial?: { show?: { uses_device_scoring?: boolean | null } | null } | null;
}

/** True when the class is judged on paper: its own flag, else the show's device-scoring switch. */
export function isPaperClass(row: ClassPaperRow | null | undefined): boolean {
  if (!row) return false;
  if (row.scores_on_paper != null) return row.scores_on_paper;
  return row.trial?.show?.uses_device_scoring === false;
}

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
      .not(
        'entry_status',
        'in',
        `(${EXCLUDED_QUEUE_STATUSES.map(status => `"${status}"`).join(',')})`
      ),
    // MYK9-1970: paper = classes.scores_on_paper, else NOT shows.uses_device_scoring (the rule
    // entry_queue_places_for_classes applies, MYK9-1969). The trial and show ride along.
    supabase
      .from('classes')
      .select('name, scores_on_paper, trial:trials(show:shows(uses_device_scoring))')
      .eq('id', classId)
      .single(),
  ]);

  return {
    entryRows,
    entriesError,
    // A failed name read only degrades the alert copy; it never blocks the send.
    className: (classRow as { name?: string } | null)?.name ?? DEFAULT_CLASS_NAME,
    onPaper: isPaperClass(classRow as ClassPaperRow | null),
  };
}
