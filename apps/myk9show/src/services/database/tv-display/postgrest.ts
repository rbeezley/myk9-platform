import { supabase } from '../supabaseClient';
import {
  groupEntriesByClass,
  mapJoinedDog,
  mapShow,
  toNullableNumber,
  TV_ACTIVE_STATUSES,
} from './mappers';
import type { TVCompletedClass, TVDisplayData, TVEntry, TVPlacement } from '@/pages/TVDisplay/types';

function mapPostgrestEntry(raw: Record<string, unknown>): TVEntry {
  return {
    id: raw.id as string,
    armband: raw.armband as string | null,
    handler: raw.handler as string | null,
    runOrder: raw.run_order as number | null,
    isInRing: (raw.is_in_ring as boolean) ?? false,
    isScored: (raw.is_scored as boolean) ?? false,
    dog: mapJoinedDog(
      raw.dogs as {
        name: string;
        call_name: string | null;
        breed: string | null;
        image_url: string | null;
      } | null
    ),
  };
}

export async function getPostgrestTVDisplayData(
  showId: string,
  trialId?: string
): Promise<TVDisplayData> {
  const { data: showData, error: showError } = await supabase
    .from('shows')
    .select('id, name, start_date, end_date')
    .eq('id', showId)
    .single();

  if (showError || !showData) return { show: null, classes: [] };

  let classQuery = supabase
    .from('classes')
    .select(
      'id, name, element, level, status, total_entries_count, scored_count, start_time, trials!inner(show_id, trial_date:date, trial_number), judge_assignments(people(first_name, last_name))'
    )
    .eq('trials.show_id', showId)
    .in('status', [...TV_ACTIVE_STATUSES]);

  if (trialId) classQuery = classQuery.eq('trial_id', trialId);

  const { data: classData, error: classError } = await classQuery;
  if (classError || !classData || classData.length === 0) {
    return { show: mapShow(showData), classes: [] };
  }

  const classIds = classData.map(c => c.id);
  const { data: entryData } = await supabase
    .from('entries')
    .select(
      'id, class_id, armband, handler, run_order, is_in_ring, is_scored, dogs(name, call_name, breed, image_url)'
    )
    .in('class_id', classIds)
    .or('is_scored.eq.false,is_in_ring.eq.true')
    .order('run_order', { ascending: true });

  const classIdByEntryId = new Map<string, string>(
    (entryData ?? [])
      .filter(
        (entry): entry is typeof entry & { class_id: string } => typeof entry.class_id === 'string'
      )
      .map(entry => [entry.id, entry.class_id])
  );
  const entriesByClass = groupEntriesByClass(
    (entryData ?? []).map(entry => mapPostgrestEntry(entry as Record<string, unknown>)),
    classIdByEntryId
  );

  return {
    show: mapShow(showData),
    classes: classData.map(c => {
      const trial = c.trials as unknown as {
        trial_date: string | null;
        trial_number: string | number | null;
      } | null;
      const judgeAssignments = c.judge_assignments as unknown as Array<{
        people: { first_name: string; last_name: string } | null;
      }> | null;
      const firstJudge = judgeAssignments?.[0]?.people;
      return {
        id: c.id,
        name: c.name,
        element: c.element,
        level: c.level,
        status: c.status,
        judgeName: firstJudge ? `${firstJudge.first_name} ${firstJudge.last_name}`.trim() : null,
        totalEntries: c.total_entries_count,
        scoredCount: c.scored_count,
        startTime: c.start_time,
        trialDate: trial?.trial_date ?? null,
        trialNumber: toNullableNumber(trial?.trial_number),
        entries: entriesByClass.get(c.id) ?? [],
      };
    }),
  };
}

export async function getPostgrestTVDisplayResults(
  showId: string,
  trialId?: string
): Promise<TVCompletedClass[]> {
  let classQuery = supabase
    .from('classes')
    .select(
      'id, name, element, level, total_entries_count, trials!inner(show_id), judge_assignments(people(first_name, last_name))'
    )
    .eq('trials.show_id', showId)
    .eq('is_scoring_finalized', true);

  if (trialId) classQuery = classQuery.eq('trial_id', trialId);

  const { data: classData, error: classError } = await classQuery;
  if (classError || !classData || classData.length === 0) return [];

  const classIds = classData.map(c => c.id);
  const { data: placementData } = await supabase
    .from('entries')
    .select(
      'id, class_id, armband, handler, final_placement, search_time_seconds, total_score, result_status, dogs(name, call_name, breed, image_url)'
    )
    .in('class_id', classIds)
    .gte('final_placement', 1)
    .lte('final_placement', 4)
    .order('final_placement', { ascending: true });

  const { data: qualifiedData } = await supabase
    .from('entries')
    .select('class_id, search_time_seconds')
    .in('class_id', classIds)
    .eq('result_status', 'qualified');

  const placementsByClass = new Map<string, TVPlacement[]>();
  for (const p of placementData ?? []) {
    const classId = p.class_id as string;
    const group = placementsByClass.get(classId) ?? [];
    group.push({
      placement: p.final_placement!,
      armband: p.armband,
      handler: p.handler,
      searchTime: p.search_time_seconds,
      totalScore: p.total_score,
      dog: mapJoinedDog(
        p.dogs as {
          name: string;
          call_name: string | null;
          breed: string | null;
          image_url: string | null;
        } | null
      ),
    });
    placementsByClass.set(classId, group);
  }

  const qualifiedByClass = new Map<string, { count: number; fastest: number | null }>();
  for (const q of qualifiedData ?? []) {
    const classId = q.class_id as string;
    const current = qualifiedByClass.get(classId) ?? { count: 0, fastest: null };
    current.count++;
    if (q.search_time_seconds != null) {
      current.fastest =
        current.fastest == null
          ? q.search_time_seconds
          : Math.min(current.fastest, q.search_time_seconds);
    }
    qualifiedByClass.set(classId, current);
  }

  return classData.map(c => {
    const judgeAssignments = c.judge_assignments as unknown as Array<{
      people: { first_name: string; last_name: string } | null;
    }> | null;
    const firstJudge = judgeAssignments?.[0]?.people;
    const stats = qualifiedByClass.get(c.id);
    return {
      id: c.id,
      name: c.name,
      element: c.element,
      level: c.level,
      judgeName: firstJudge ? `${firstJudge.first_name} ${firstJudge.last_name}`.trim() : null,
      totalEntries: c.total_entries_count,
      qualifiedCount: stats?.count ?? 0,
      fastestTime: stats?.fastest ?? null,
      placements: placementsByClass.get(c.id) ?? [],
    };
  });
}
