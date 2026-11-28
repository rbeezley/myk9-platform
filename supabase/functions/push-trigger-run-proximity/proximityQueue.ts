// The two reads the ring-proximity trigger can start before it knows anything
// else: the class queue and the class name depend only on `classId`, so they
// run together (MYK9-1372). Everything after them is sequential because each
// step needs the previous result: favorites need the queue's armbands,
// preferences need the candidate user ids.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';

export const DEFAULT_CLASS_NAME = 'your class';

// MYK9-2412: the dogs counted ahead are the ones `entry_queue_places_for_classes` puts in line
// (MYK9-2391), so the alert's "N dogs away" matches the place on screen. The Deno function
// cannot import app code: keep these two lists in step with that function's two NOT IN lists
// and the client's `isExpectedEntry` / `isPendingEntryStatus`.
const OFF_LINE_ENTRY_STATUSES = ['withdrawn', 'scratched', 'absent', 'moved', 'not_accepted'];

/** Not yet approved (Pending), so not in the running line. 'no-status' is the column default. */
const PENDING_ENTRY_STATUSES = [
  'submitted',
  'pending',
  'draft',
  'no-status',
  'pending-payment',
  'paid',
  'promotion-expired',
];

export const EXCLUDED_QUEUE_STATUSES = [...OFF_LINE_ENTRY_STATUSES, ...PENDING_ENTRY_STATUSES];

// A NULL status stays in line, as on the server; a bare `not.in` would drop it.
const QUEUE_STATUS_FILTER = `entry_status.is.null,entry_status.not.in.(${EXCLUDED_QUEUE_STATUSES.map(
  status => `"${status}"`
).join(',')})`;

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
      .or(QUEUE_STATUS_FILTER),
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
