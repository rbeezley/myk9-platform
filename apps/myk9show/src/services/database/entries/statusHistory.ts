import type { Tables } from '@/types/supabase';
import { createDatabaseError, logQuery, supabase } from '../supabaseClient';

export interface EntryStatusHistoryItem {
  id: string;
  entryId: string;
  previousStatus: string | null;
  newStatus: string;
  changedBy: string | null;
  changedAt: string | null;
  reason: string | null;
  actorName: string | null;
}

export const ENTRY_STATUS_HISTORY_SELECT = `
  id,
  entry_id,
  previous_status,
  new_status,
  changed_by,
  changed_at,
  reason,
  changed_person:changed_by (
    id,
    first_name,
    last_name
  )
`;

type EntryStatusHistoryRow = Tables<'entry_status_history'>;

interface EntryStatusHistoryQueryRow extends EntryStatusHistoryRow {
  changed_person?: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
}

function actorName(row: EntryStatusHistoryQueryRow): string | null {
  const name = row.changed_person
    ? `${row.changed_person.first_name} ${row.changed_person.last_name}`.trim()
    : '';
  return name || null;
}

export function mapEntryStatusHistoryRow(row: EntryStatusHistoryQueryRow): EntryStatusHistoryItem {
  return {
    id: row.id,
    entryId: row.entry_id,
    previousStatus: row.previous_status,
    newStatus: row.new_status,
    changedBy: row.changed_by,
    changedAt: row.changed_at,
    reason: row.reason,
    actorName: actorName(row),
  };
}

export async function getEntryStatusHistory(entryId: string): Promise<EntryStatusHistoryItem[]> {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entry_status_history')
      .select(ENTRY_STATUS_HISTORY_SELECT)
      .eq('entry_id', entryId)
      .order('changed_at', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true });

    const duration = Date.now() - startTime;
    logQuery('entry_status_history', 'get_entry_status_history', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entry_status_history', 'get_entry_status_history');
    }

    return ((data ?? []) as unknown as EntryStatusHistoryQueryRow[]).map(mapEntryStatusHistoryRow);
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entry_status_history', 'get_entry_status_history');
    logQuery('entry_status_history', 'get_entry_status_history', duration, dbError.message);
    throw dbError;
  }
}
