import { supabase } from './supabaseClient';
import {
  buildShowIncidentPayload,
  type ShowIncidentFormInput,
  type ShowIncidentInsertPayload,
  type ShowIncidentRecord,
} from '@/features/show-workbench/showIncidents';

interface DbResult<T> {
  data: T | null;
  error: Error | null;
}

interface ShowIncidentsSelectQuery {
  eq(column: string, value: string): ShowIncidentsSelectQuery;
  limit(count: number): Promise<DbResult<ShowIncidentRecord[]>>;
  order(column: string, options: { ascending: boolean }): ShowIncidentsSelectQuery;
}

interface ShowIncidentsInsertQuery {
  select(columns: string): {
    single(): Promise<DbResult<ShowIncidentRecord>>;
  };
}

interface ShowIncidentsTable {
  insert(payload: ShowIncidentInsertPayload): ShowIncidentsInsertQuery;
  select(columns: string): ShowIncidentsSelectQuery;
}

// TODO: Replace this narrow table shape after Supabase generated types include show_incidents.
const db = supabase as unknown as {
  from(table: 'show_incidents'): ShowIncidentsTable;
};

const SHOW_INCIDENT_SELECT_COLUMNS =
  'id, incident_type, severity, occurred_at, summary, description, action_taken, dog_name, handler_name, judge_name, created_by_name, created_at';
const RECENT_INCIDENT_LIMIT = 5;
const CLOSEOUT_INCIDENT_LIMIT = 100;

export const showIncidentsQueryKey = (showId: string) => ['show-incidents', showId] as const;
export const showIncidentCloseoutQueryKey = (showId: string) =>
  ['show-incidents', showId, 'closeout'] as const;

export async function listShowIncidents(showId: string): Promise<ShowIncidentRecord[]> {
  const { data, error } = await db
    .from('show_incidents')
    .select(SHOW_INCIDENT_SELECT_COLUMNS)
    .eq('show_id', showId)
    .order('occurred_at', { ascending: false })
    .limit(RECENT_INCIDENT_LIMIT);

  if (error) throw error;
  return (data ?? []) as ShowIncidentRecord[];
}

export async function listShowIncidentCloseout(showId: string): Promise<ShowIncidentRecord[]> {
  const { data, error } = await db
    .from('show_incidents')
    .select(SHOW_INCIDENT_SELECT_COLUMNS)
    .eq('show_id', showId)
    .order('occurred_at', { ascending: false })
    .limit(CLOSEOUT_INCIDENT_LIMIT);

  if (error) throw error;
  return (data ?? []) as ShowIncidentRecord[];
}

export async function createShowIncident(input: ShowIncidentFormInput): Promise<ShowIncidentRecord> {
  const payload = buildShowIncidentPayload(input);
  const { data, error } = await db
    .from('show_incidents')
    .insert(payload)
    .select(SHOW_INCIDENT_SELECT_COLUMNS)
    .single();

  if (error) throw error;
  return data as ShowIncidentRecord;
}
