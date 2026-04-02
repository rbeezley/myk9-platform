import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import { TVCompletedClass, TVPlacement, mapDogInfo } from './types';

interface TVResultsResult {
  completedClasses: TVCompletedClass[];
  isLoading: boolean;
  error: Error | null;
}

async function fetchTVResults(showId: string, trialId?: string): Promise<TVCompletedClass[]> {
  // Fetch finalized classes for this show, including judge name via judge_assignments join
  let classQuery = supabase
    .from('classes')
    .select(
      'id, name, element, level, total_entries_count, trials!inner(show_id), judge_assignments(people(first_name, last_name))'
    )
    .eq('trials.show_id', showId)
    .eq('is_scoring_finalized', true);

  if (trialId) {
    classQuery = classQuery.eq('trial_id', trialId);
  }

  const { data: classData, error: classError } = await classQuery;

  if (classError || !classData || classData.length === 0) {
    return [];
  }

  const classIds = classData.map(c => c.id);

  // Fetch top 4 placements for all completed classes
  const { data: placementData } = await supabase
    .from('entries')
    .select(
      'id, class_id, armband, handler, final_placement, search_time_seconds, total_score, result_status, dogs(name, call_name, breed, image_url)'
    )
    .in('class_id', classIds)
    .gte('final_placement', 1)
    .lte('final_placement', 4)
    .order('final_placement', { ascending: true });

  // Group placements by class
  const placementsByClass = new Map<string, TVPlacement[]>();
  for (const p of placementData ?? []) {
    const classId = p.class_id as string;
    if (!placementsByClass.has(classId)) {
      placementsByClass.set(classId, []);
    }
    placementsByClass.get(classId)!.push({
      placement: p.final_placement!,
      armband: p.armband,
      handler: p.handler,
      searchTime: p.search_time_seconds,
      totalScore: p.total_score,
      dog: mapDogInfo(
        p.dogs as {
          name: string;
          call_name: string | null;
          breed: string | null;
          image_url: string | null;
        } | null
      ),
    });
  }

  // Fetch qualified counts and fastest times per class
  const { data: qualifiedData } = await supabase
    .from('entries')
    .select('class_id, search_time_seconds')
    .in('class_id', classIds)
    .eq('result_status', 'qualified');

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
    // Extract judge name from judge_assignments join — same pattern as useTVData
    const judgeAssignments = c.judge_assignments as unknown as Array<{
      people: { first_name: string; last_name: string } | null;
    }> | null;
    const firstJudge = judgeAssignments?.[0]?.people;
    const judgeName = firstJudge ? `${firstJudge.first_name} ${firstJudge.last_name}`.trim() : null;

    const stats = qualifiedByClass.get(c.id);
    return {
      id: c.id,
      name: c.name,
      element: c.element,
      level: c.level,
      judgeName,
      totalEntries: c.total_entries_count,
      qualifiedCount: stats?.count ?? 0,
      fastestTime: stats?.fastest ?? null,
      placements: placementsByClass.get(c.id) ?? [],
    };
  });
}

export function useTVResults(showId: string, trialId?: string): TVResultsResult {
  const { data, isLoading, error } = useQuery({
    queryKey: [...queryKeys.tvResults(showId), trialId],
    queryFn: () => fetchTVResults(showId, trialId),
    ...cacheStrategies.realtime,
    enabled: !!showId,
  });

  return {
    completedClasses: data ?? [],
    isLoading,
    error: error as Error | null,
  };
}
