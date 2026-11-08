import { getTrialTimezone } from '@/features/registries';
import type { Tables } from '@/types/supabase';
import { createDatabaseError, logQuery, supabase } from '../supabaseClient';

// MYK9-1754: read side of public.entry_score_audit. This is an online-only admin
// audit read (RLS admits show managers only), not show-day data, so it goes to
// PostgREST rather than a replicated table.

type AuditRow = Tables<'entry_score_audit'>;

export type ScoreAuditTier = AuditRow['actor_tier'];

export interface ScoreAuditChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface EntryScoreAuditItem {
  id: string;
  changedAt: string;
  /** Device save time (offline queue); null when the client did not send one. */
  clientSavedAt: string | null;
  actorName: string | null;
  actorTier: ScoreAuditTier;
  passcodeRole: string | null;
  changes: ScoreAuditChange[];
  /** IANA zone of the trial the entry was in when the write landed. */
  timeZone: string;
}

interface ClassTrialRow {
  id: string;
  trial: { id: string; timezone: string | null } | null;
}

export function parseScoreAuditChanges(raw: AuditRow['changes']): ScoreAuditChange[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  return Object.entries(raw).map(([field, diff]) => {
    const pair = (diff && typeof diff === 'object' && !Array.isArray(diff) ? diff : {}) as Record<
      string,
      unknown
    >;
    return { field, oldValue: pair.old ?? null, newValue: pair.new ?? null };
  });
}

export function mapEntryScoreAuditRow(
  row: AuditRow,
  timeZoneByClass: ReadonlyMap<string, string>
): EntryScoreAuditItem {
  return {
    id: row.id,
    changedAt: row.changed_at,
    clientSavedAt: row.client_saved_at,
    actorName: row.actor_display_name,
    actorTier: row.actor_tier,
    passcodeRole: row.passcode_role,
    changes: parseScoreAuditChanges(row.changes),
    timeZone: timeZoneByClass.get(row.class_id) ?? getTrialTimezone(null),
  };
}

async function loadTimeZones(classIds: string[]): Promise<Map<string, string>> {
  const zones = new Map<string, string>();
  if (classIds.length === 0) return zones;
  const { data } = await supabase
    .from('classes')
    .select('id, trial:trials(id, timezone)')
    .in('id', classIds);
  for (const row of (data ?? []) as unknown as ClassTrialRow[]) {
    zones.set(row.id, getTrialTimezone(row.trial));
  }
  return zones;
}

export async function getEntryScoreAudit(entryId: string): Promise<EntryScoreAuditItem[]> {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entry_score_audit')
      .select(
        'id, entry_id, class_id, show_id, changed_at, changes, actor_user_id, actor_person_id, actor_display_name, actor_tier, passcode_role, passcode_generation, entry_version, client_saved_at'
      )
      .eq('entry_id', entryId)
      .order('changed_at', { ascending: true })
      .order('id', { ascending: true });

    logQuery('entry_score_audit', 'get_entry_score_audit', Date.now() - startTime, error?.message);
    if (error) throw createDatabaseError(error, 'entry_score_audit', 'get_entry_score_audit');

    const rows = (data ?? []) as AuditRow[];
    const zones = await loadTimeZones([...new Set(rows.map(row => row.class_id))]);
    return rows.map(row => mapEntryScoreAuditRow(row, zones));
  } catch (error) {
    const dbError = createDatabaseError(error, 'entry_score_audit', 'get_entry_score_audit');
    logQuery('entry_score_audit', 'get_entry_score_audit', Date.now() - startTime, dbError.message);
    throw dbError;
  }
}
