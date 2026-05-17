import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';

/** Resolved judge identity for a trial. person_id is null for legacy
 * classes whose `classes.judge_name` is set without a corresponding
 * `judge_assignments` row. */
export interface TrialJudge {
  person_id: string | null;
  judge_name: string;
}

interface JudgeAssignmentRow {
  person_id: string;
  people: { id: string; first_name: string | null; last_name: string | null };
}

interface ClassJudgeNameRow {
  judge_name: string | null;
}

async function fetchTrialJudges(trialId: string): Promise<TrialJudge[]> {
  const [assignmentsRes, classesRes] = await Promise.all([
    supabase
      .from('judge_assignments')
      .select('person_id, people!inner(id, first_name, last_name)')
      .eq('trial_id', trialId),
    supabase
      .from('classes')
      .select('judge_name')
      .eq('trial_id', trialId)
      .not('judge_name', 'is', null),
  ]);

  if (assignmentsRes.error) throw assignmentsRes.error;
  if (classesRes.error) throw classesRes.error;

  const judges: TrialJudge[] = [];
  const seenPersonIds = new Set<string>();
  const seenNames = new Set<string>();

  for (const row of (assignmentsRes.data ?? []) as unknown as JudgeAssignmentRow[]) {
    const personId = row.person_id;
    if (!personId || seenPersonIds.has(personId)) continue;
    seenPersonIds.add(personId);
    const first = row.people?.first_name ?? '';
    const last = row.people?.last_name ?? '';
    const name = `${first} ${last}`.trim() || 'Unknown Judge';
    seenNames.add(name);
    judges.push({ person_id: personId, judge_name: name });
  }

  for (const row of (classesRes.data ?? []) as ClassJudgeNameRow[]) {
    const name = (row.judge_name ?? '').trim();
    if (!name) continue;
    if (seenNames.has(name)) continue;
    seenNames.add(name);
    judges.push({ person_id: null, judge_name: name });
  }

  return judges.sort((a, b) => a.judge_name.localeCompare(b.judge_name));
}

export function useTrialJudges(trialId: string | null | undefined) {
  return useQuery({
    queryKey: ['trial-judges', trialId ?? ''] as const,
    queryFn: () => fetchTrialJudges(trialId!),
    enabled: !!trialId,
  });
}

async function fetchTrialRegistry(trialId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('trials')
    .select('registry_id')
    .eq('id', trialId)
    .single();
  if (error) throw error;
  return (data as { registry_id?: string | null } | null)?.registry_id ?? null;
}

export function useTrialRegistry(trialId: string | null | undefined) {
  return useQuery({
    queryKey: ['trial-registry', trialId ?? ''] as const,
    queryFn: () => fetchTrialRegistry(trialId!),
    enabled: !!trialId,
    staleTime: 5 * 60 * 1000,
  });
}
