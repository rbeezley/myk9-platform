import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';

/**
 * Resolved judge identity for a trial.
 *
 * `person_id` is typed nullable because `trial_judge_supplies.person_id` is, and
 * `judgeKey` folds both shapes. This hook itself only ever yields a person-backed
 * judge: the legacy path that surfaced `classes.judge_name` strings without an
 * assignment row ended when that column was dropped (MYK9-479) — a class's judge
 * is its judge_assignments row and nothing else.
 */
export interface TrialJudge {
  person_id: string | null;
  judge_name: string;
}

interface JudgeAssignmentRow {
  person_id: string;
  people: { id: string; first_name: string | null; last_name: string | null };
}

async function fetchTrialJudges(trialId: string): Promise<TrialJudge[]> {
  const { data, error } = await supabase
    .from('judge_assignments')
    .select('person_id, people!inner(id, first_name, last_name)')
    .eq('trial_id', trialId);

  if (error) throw error;

  const judges: TrialJudge[] = [];
  const seenPersonIds = new Set<string>();

  for (const row of (data ?? []) as unknown as JudgeAssignmentRow[]) {
    const personId = row.person_id;
    if (!personId || seenPersonIds.has(personId)) continue;
    seenPersonIds.add(personId);
    const first = row.people?.first_name ?? '';
    const last = row.people?.last_name ?? '';
    const name = `${first} ${last}`.trim() || 'Unknown Judge';
    judges.push({ person_id: personId, judge_name: name });
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
