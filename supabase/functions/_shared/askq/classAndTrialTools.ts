import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { ClassSummary, TrialSummary } from './types.ts';
import type { ShowScope } from './showScope.ts';

type SupabaseClient = ReturnType<typeof createClient>;

interface TrialRow {
  id: string;
  date: string;
  name: string;
  trial_number: string | null;
  show_id: string;
  shows?: { name: string } | { name: string }[] | null;
}

interface ClassRow {
  id: string;
  trial_id: string;
  element: string | null;
  level: string | null;
  section: string | null;
  judge_name: string | null;
  status: string;
  start_time: string | null;
}

interface ClassEntryRow {
  class_id: string;
  entry_status: string | null;
  is_scored: boolean;
  check_in_status: string | null;
  result_status: string | null;
}

const IMPOSSIBLE_SHOW_ID = '00000000-0000-0000-0000-000000000000';

function applyTrialScope<Q extends { eq(column: string, value: unknown): Q }>(
  query: Q,
  scope: ShowScope
): Q {
  if (scope.showId) {
    return query.eq('show_id', scope.showId);
  }
  if (scope.licenseKey) {
    return query.eq('shows.license_key', scope.licenseKey);
  }
  return query.eq('show_id', IMPOSSIBLE_SHOW_ID);
}

function showNameFromTrial(trial: TrialRow): string {
  const show = Array.isArray(trial.shows) ? trial.shows[0] : trial.shows;
  return show?.name ?? '';
}

function isActiveEntry(entry: ClassEntryRow): boolean {
  return (
    !['withdrawn', 'scratched', 'cancelled'].includes(entry.entry_status ?? '') &&
    entry.check_in_status !== 'pulled'
  );
}

function isCheckedIn(entry: ClassEntryRow): boolean {
  return ['checked-in', 'at-gate', 'come-to-gate', 'in-ring', 'completed'].includes(
    entry.check_in_status ?? ''
  );
}

export async function executeGetClassSummary(
  params: {
    trial_date?: string;
    element?: string;
    level?: string;
    class_status?: string;
  },
  supabase: SupabaseClient,
  scope: ShowScope
): Promise<{ data: ClassSummary[]; error?: string }> {
  try {
    let trialQuery = supabase
      .from('trials')
      .select('id, date, name, trial_number, show_id, shows!inner(name, license_key)');

    trialQuery = applyTrialScope(trialQuery, scope);

    if (params.trial_date) {
      trialQuery = trialQuery.eq('date', params.trial_date);
    }

    const { data: trialData, error: trialError } = await trialQuery;
    if (trialError) {
      console.error('Class summary trial lookup error:', trialError);
      return { data: [], error: trialError.message };
    }

    const trials = (trialData ?? []) as TrialRow[];
    if (trials.length === 0) {
      return { data: [] };
    }

    const trialById = new Map(trials.map(trial => [trial.id, trial]));
    let classQuery = supabase
      .from('classes')
      .select('id, trial_id, element, level, section, judge_name, status, start_time')
      .in(
        'trial_id',
        trials.map(trial => trial.id)
      );

    if (params.element) {
      classQuery = classQuery.ilike('element', `%${params.element}%`);
    }
    if (params.level) {
      classQuery = classQuery.ilike('level', `%${params.level}%`);
    }
    if (params.class_status) {
      classQuery = classQuery.eq('status', params.class_status);
    }

    classQuery = classQuery.order('start_time');

    const { data: classData, error: classError } = await classQuery;
    if (classError) {
      console.error('Class summary error:', classError);
      return { data: [], error: classError.message };
    }

    const classes = (classData ?? []) as ClassRow[];
    if (classes.length === 0) {
      return { data: [] };
    }

    const classIds = classes.map(cls => cls.id);
    const { data: entryData, error: entryError } = await supabase
      .from('entries')
      .select('class_id, entry_status, is_scored, check_in_status, result_status')
      .in('class_id', classIds)
      .is('deleted_at', null);

    if (entryError) {
      console.error('Class summary entry lookup error:', entryError);
      return { data: [], error: entryError.message };
    }

    const entriesByClass = new Map<string, ClassEntryRow[]>();
    for (const entry of (entryData ?? []) as ClassEntryRow[]) {
      const entries = entriesByClass.get(entry.class_id) ?? [];
      entries.push(entry);
      entriesByClass.set(entry.class_id, entries);
    }

    const result = classes
      .map(cls => {
        const trial = trialById.get(cls.trial_id);
        if (!trial) return null;

        const entries = (entriesByClass.get(cls.id) ?? []).filter(isActiveEntry);
        return {
          class_id: cls.id,
          element: cls.element,
          level: cls.level,
          section: cls.section,
          judge_name: cls.judge_name,
          class_status: cls.status,
          total_entries: entries.length,
          scored_entries: entries.filter(entry => entry.is_scored).length,
          checked_in_count: entries.filter(isCheckedIn).length,
          qualified_count: entries.filter(entry => entry.result_status === 'qualified').length,
          nq_count: entries.filter(entry => entry.result_status === 'nq').length,
          trial_date: trial.date,
          trial_name: trial.name,
          start_time: cls.start_time,
        } satisfies ClassSummary;
      })
      .filter((summary): summary is ClassSummary => summary !== null);

    result.sort((left, right) => {
      const dateOrder = left.trial_date.localeCompare(right.trial_date);
      if (dateOrder !== 0) return dateOrder;

      return (left.start_time ?? '99:99:99').localeCompare(right.start_time ?? '99:99:99');
    });

    return { data: result.slice(0, 50) };
  } catch (err) {
    console.error('Class summary exception:', err);
    return { data: [], error: String(err) };
  }
}

export async function executeGetTrialOverview(
  params: { trial_date?: string },
  supabase: SupabaseClient,
  scope: ShowScope
): Promise<{ data: TrialSummary[]; error?: string }> {
  try {
    let query = supabase
      .from('trials')
      .select('id, date, name, trial_number, show_id, shows!inner(name, license_key)');

    query = applyTrialScope(query, scope);

    if (params.trial_date) {
      query = query.eq('date', params.trial_date);
    }

    query = query.order('date').order('trial_number').limit(20);

    const { data, error } = await query;
    if (error) {
      console.error('Trial overview error:', error);
      return { data: [], error: error.message };
    }

    return {
      data: ((data ?? []) as TrialRow[]).map(trial => ({
        trial_id: trial.id,
        trial_number: trial.trial_number,
        trial_date: trial.date,
        trial_name: trial.name,
        show_name: showNameFromTrial(trial),
      })),
    };
  } catch (err) {
    console.error('Trial overview exception:', err);
    return { data: [], error: String(err) };
  }
}
