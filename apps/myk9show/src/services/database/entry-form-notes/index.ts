// MYK9-1601: secretary notes on an entry form, private to show officials.
//
// ONLINE-ONLY by decision: direct PostgREST, no replication. The table's RLS admits only
// show officials and site admins (official_show_ids() / is_site_admin()); there is no
// handler/owner arm. NEVER import this module from an exhibitor-facing surface, email,
// export or report (entryFormNotesPrivacy.test.ts pins the list of consumers).

import type { Database } from '@/types/supabase';
import { supabase } from '../supabaseClient';

export interface EntryFormNote {
  id: string;
  enrollmentId: string;
  showId: string;
  body: string;
  /** people.id of the author (not auth.uid()); null once that person is deleted. */
  createdBy: string | null;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
}

type NoteUpdate = Database['public']['Tables']['entry_form_notes']['Update'];

const NOTE_SELECT =
  'id, enrollment_id, show_id, body, created_by, created_at, updated_at, author:people!created_by(first_name, last_name)' as const;

interface NoteRow {
  id: string;
  enrollment_id: string;
  show_id: string;
  body: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  author: { first_name: string | null; last_name: string | null } | null;
}

function toNote(row: NoteRow): EntryFormNote {
  const name = [row.author?.first_name, row.author?.last_name].filter(Boolean).join(' ').trim();
  return {
    id: row.id,
    enrollmentId: row.enrollment_id,
    showId: row.show_id,
    body: row.body,
    createdBy: row.created_by,
    authorName: name || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Live notes on one entry form, newest first. */
export async function listEntryFormNotes(enrollmentId: string): Promise<EntryFormNote[]> {
  const { data, error } = await supabase
    .from('entry_form_notes')
    .select(NOTE_SELECT)
    .eq('enrollment_id', enrollmentId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: NoteRow) => toNote(row));
}

/**
 * created_by is the caller's people.id. show_id is required by the table; the guard trigger
 * re-derives it from the enrollment, so a wrong value can never misfile a note.
 */
export async function addEntryFormNote(
  enrollmentId: string,
  showId: string,
  body: string,
  createdBy: string
): Promise<void> {
  const { error } = await supabase
    .from('entry_form_notes')
    .insert({
      enrollment_id: enrollmentId,
      show_id: showId,
      body: body.trim(),
      created_by: createdBy,
    });
  if (error) throw error;
}

export const NOTE_CHANGE_REFUSED = 'You can no longer change this note.';

/** RLS filters a row you may not change out silently (0 rows, no error): treat that as a refusal. */
async function writeOwnNote(id: string, patch: NoteUpdate): Promise<void> {
  const { data, error } = await supabase
    .from('entry_form_notes')
    .update(patch)
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error(NOTE_CHANGE_REFUSED);
}

export function updateEntryFormNote(id: string, body: string): Promise<void> {
  return writeOwnNote(id, { body: body.trim() });
}

/** Soft delete. RLS limits it to the note's author or a site admin; deletion is final. */
export function deleteEntryFormNote(id: string): Promise<void> {
  return writeOwnNote(id, { deleted_at: new Date().toISOString() });
}
