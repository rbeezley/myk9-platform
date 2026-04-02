import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import { TV_ACTIVE_STATUSES, TVShowInfo, TVClass, TVEntry, mapDogInfo } from './types';

interface TVDataResult {
  show: TVShowInfo | null;
  classes: TVClass[];
  isLoading: boolean;
  error: Error | null;
}

function mapEntry(raw: Record<string, unknown>): TVEntry {
  return {
    id: raw.id as string,
    armband: raw.armband as string | null,
    handler: raw.handler as string | null,
    runOrder: raw.run_order as number | null,
    isInRing: (raw.is_in_ring as boolean) ?? false,
    isScored: (raw.is_scored as boolean) ?? false,
    dog: mapDogInfo(
      raw.dogs as {
        name: string;
        call_name: string | null;
        breed: string | null;
        image_url: string | null;
      } | null
    ),
  };
}

async function fetchTVData(
  showId: string,
  trialId?: string
): Promise<{ show: TVShowInfo | null; classes: TVClass[] }> {
  // Fetch show info
  const { data: showData, error: showError } = await supabase
    .from('shows')
    .select('id, name, start_date, end_date')
    .eq('id', showId)
    .single();

  if (showError || !showData) {
    return { show: null, classes: [] };
  }

  const show: TVShowInfo = {
    id: showData.id,
    name: showData.name,
    startDate: showData.start_date,
    endDate: showData.end_date,
  };

  // Fetch active classes (joined with trials to filter by show, and judge_assignments for judge name)
  let classQuery = supabase
    .from('classes')
    .select(
      'id, name, element, level, status, total_entries_count, scored_count, start_time, trials!inner(show_id, trial_date, trial_number), judge_assignments(people(first_name, last_name))'
    )
    .eq('trials.show_id', showId)
    .in('status', [...TV_ACTIVE_STATUSES]);

  if (trialId) {
    classQuery = classQuery.eq('trial_id', trialId);
  }

  const { data: classData, error: classError } = await classQuery;

  if (classError || !classData || classData.length === 0) {
    return { show, classes: [] };
  }

  // Fetch entries for all active classes
  const classIds = classData.map(c => c.id);
  const { data: entryData } = await supabase
    .from('entries')
    .select(
      'id, class_id, armband, handler, run_order, is_in_ring, is_scored, dogs(name, call_name, breed, image_url)'
    )
    .in('class_id', classIds)
    .eq('is_scored', false)
    .order('run_order', { ascending: true });

  // Also fetch the in-ring entry (which may be scored already)
  const { data: inRingData } = await supabase
    .from('entries')
    .select(
      'id, class_id, armband, handler, run_order, is_in_ring, is_scored, dogs(name, call_name, breed, image_url)'
    )
    .in('class_id', classIds)
    .eq('is_in_ring', true);

  // Combine and deduplicate
  const allEntries = [...(entryData ?? []), ...(inRingData ?? [])];
  const uniqueEntries = Array.from(new Map(allEntries.map(e => [e.id, e])).values());

  // Group entries by class
  const entriesByClass = new Map<string, TVEntry[]>();
  for (const entry of uniqueEntries) {
    const classId = entry.class_id as string;
    if (!entriesByClass.has(classId)) {
      entriesByClass.set(classId, []);
    }
    entriesByClass.get(classId)!.push(mapEntry(entry as Record<string, unknown>));
  }

  // Sort entries: in-ring first, then by run_order
  for (const [, entries] of entriesByClass) {
    entries.sort((a, b) => {
      if (a.isInRing && !b.isInRing) return -1;
      if (!a.isInRing && b.isInRing) return 1;
      return (a.runOrder ?? 999) - (b.runOrder ?? 999);
    });
  }

  // Map classes
  const classes: TVClass[] = classData.map(c => {
    const trial = c.trials as unknown as {
      show_id: string;
      trial_date: string;
      trial_number: number;
    };
    const judgeAssignments = c.judge_assignments as unknown as Array<{
      people: { first_name: string; last_name: string } | null;
    }> | null;
    const firstJudge = judgeAssignments?.[0]?.people;
    const judgeName = firstJudge ? `${firstJudge.first_name} ${firstJudge.last_name}`.trim() : null;
    return {
      id: c.id,
      name: c.name,
      element: c.element,
      level: c.level,
      status: c.status,
      judgeName,
      totalEntries: c.total_entries_count,
      scoredCount: c.scored_count,
      startTime: c.start_time,
      trialDate: trial?.trial_date ?? null,
      trialNumber: trial?.trial_number ?? null,
      entries: entriesByClass.get(c.id) ?? [],
    };
  });

  return { show, classes };
}

export function useTVData(showId: string, trialId?: string): TVDataResult {
  const { data, isLoading, error } = useQuery({
    queryKey: [...queryKeys.tvClasses(showId), trialId],
    queryFn: () => fetchTVData(showId, trialId),
    ...cacheStrategies.realtime,
    enabled: !!showId,
  });

  return {
    show: data?.show ?? null,
    classes: data?.classes ?? [],
    isLoading,
    error: error as Error | null,
  };
}
