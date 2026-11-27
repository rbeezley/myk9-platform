import { supabase } from './supabaseClient';
import type { ClosedOpenLine } from '@/features/show-workbench/showCloseNotes';

/**
 * MYK9-1945 / MYK9-2428: the staff-only `show_close_notes` row (one per show). Online-only by
 * design: the table is not replicated, so these writes need a connection and throw when they
 * cannot reach the server. The caller says so plainly.
 *
 * Each write sets only its own column, so closing never clears a reopen reason and reopening
 * never clears what was open at close.
 */
async function upsertNote(
  showId: string,
  columns: { closed_open_lines: ClosedOpenLine[] } | { reopen_reason: string }
): Promise<void> {
  const { error } = await supabase
    .from('show_close_notes')
    .upsert({ show_id: showId, ...columns, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

/** What was still open when the show was closed: `[{ key, count }]`. */
export function saveClosedOpenLines(showId: string, lines: ClosedOpenLine[]): Promise<void> {
  return upsertNote(showId, { closed_open_lines: lines });
}

/** The reopen reason, with the person and time, as the text `formatReopenNote` builds. */
export function saveReopenReason(showId: string, note: string): Promise<void> {
  return upsertNote(showId, { reopen_reason: note });
}
