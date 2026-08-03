import { supabase } from '../supabaseClient';
import { fetchPublicEntryCountsByShow } from '../_shared/entryCounts';
import { isExpectedEntry } from '@/features/_shared/entryAccounting';
import {
  groupEntriesByClass,
  mapJoinedDog,
  mapShow,
  toNullableNumber,
  TV_ACTIVE_STATUSES,
} from './mappers';
import type {
  TVCompletedClass,
  TVDisplayData,
  TVEntry,
  TVPlacement,
} from '@/pages/TVDisplay/types';

/**
 * Canonical entry totals for the board, or null when they cannot be read.
 *
 * The board used to render `classes.total_entries_count`, which no trigger
 * maintains and which is 0 for every class — so a class with three scored dogs
 * published "3 / 0" to a room full of exhibitors (MYK9-65).
 *
 * Null rather than 0 on failure is the point: `TVClassCard` and
 * `TVMobileClassCard` already suppress the counter when the total is null, so a
 * venue screen that cannot reach the database shows nothing instead of a
 * confident, wrong zero.
 */
async function fetchTVEntryCounts(
  showId: string,
  classIds: readonly string[]
): Promise<Map<string, number> | null> {
  try {
    return await fetchPublicEntryCountsByShow(showId, classIds, 'select_tv_entry_counts');
  } catch {
    return null;
  }
}

/**
 * The running order behind "up next", read independently of the viewer.
 *
 * Read as a plain `entries` select this had the same defect as the totals beside
 * it — and worse, because it is the board's primary content: `entries_select` is
 * scoped to managed/handled/owned rows, so a signed-in exhibitor watching a
 * public screen saw only their own dogs queued. The `dogs` join is part of the
 * same problem, since an embedded relation is read under the viewer's session
 * too. Both moved into `tv_board_entries` (MYK9-65, migration 20260803130000).
 *
 * The RPC's row type is generated from `RETURNS TABLE`, which carries no
 * nullability, so every column arrives typed non-null. The columns really are
 * nullable in `entries`/`dogs`, and `mapRpcEntry` restores that rather than
 * trusting the generated shape.
 */
async function fetchTVBoardEntries(showId: string, classIds: string[]) {
  const { data, error } = await supabase.rpc('tv_board_entries', {
    p_show_id: showId,
    p_class_ids: classIds,
  });

  if (error) return [];
  return data ?? [];
}

type TVBoardEntryRow = Awaited<ReturnType<typeof fetchTVBoardEntries>>[number];

function mapRpcEntry(raw: TVBoardEntryRow): TVEntry {
  const dogName = (raw.dog_name as string | null) ?? null;
  return {
    id: raw.id,
    armband: (raw.armband as string | null) ?? null,
    handler: (raw.handler as string | null) ?? null,
    runOrder: (raw.run_order as number | null) ?? null,
    isInRing: raw.is_in_ring ?? false,
    isScored: raw.is_scored ?? false,
    dog: mapJoinedDog(
      dogName === null
        ? null
        : {
            name: dogName,
            call_name: (raw.dog_call_name as string | null) ?? null,
            image_url: (raw.dog_image_url as string | null) ?? null,
          }
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
      'id, name, element, level, status, scored_count, start_time, trials!inner(show_id, trial_date:date, trial_number), judge_assignments(people(first_name, last_name))'
    )
    .eq('trials.show_id', showId)
    .in('status', [...TV_ACTIVE_STATUSES]);

  if (trialId) classQuery = classQuery.eq('trial_id', trialId);

  const { data: classData, error: classError } = await classQuery;
  if (classError || !classData || classData.length === 0) {
    return { show: mapShow(showData), classes: [] };
  }

  const classIds = classData.map(c => c.id);
  // Withdrawn entries must not ride the running order, or the board's own list
  // disagrees with the total counted beside it — the RPC applies that filter,
  // and the same show predicate, server-side.
  const [entryData, entryCounts] = await Promise.all([
    fetchTVBoardEntries(showId, classIds),
    fetchTVEntryCounts(showId, classIds),
  ]);

  const classIdByEntryId = new Map<string, string>(
    entryData
      .filter(
        (entry): entry is typeof entry & { class_id: string } => typeof entry.class_id === 'string'
      )
      .map(entry => [entry.id, entry.class_id])
  );
  const entriesByClass = groupEntriesByClass(entryData.map(mapRpcEntry), classIdByEntryId);

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
        totalEntries: entryCounts?.get(c.id) ?? null,
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
      'id, name, element, level, trials!inner(show_id), judge_assignments(people(first_name, last_name))'
    )
    .eq('trials.show_id', showId)
    .eq('is_scoring_finalized', true);

  if (trialId) classQuery = classQuery.eq('trial_id', trialId);

  const { data: classData, error: classError } = await classQuery;
  if (classError || !classData || classData.length === 0) return [];

  const classIds = classData.map(c => c.id);
  const entryCounts = await fetchTVEntryCounts(showId, classIds);
  // INTENT: The TV display is a public surface. Read results through
  // view_public_entry_results so the result-visibility cascade is enforced by
  // the database — placements/times/quals for classes whose results have not
  // been released arrive NULL and are naturally filtered out below.
  const { data: placementRows } = await supabase
    .from('view_public_entry_results')
    .select(
      'id, class_id, armband, handler, final_placement, search_time_seconds, total_score, result_status, entry_status, check_in_status, dog_name, dog_call_name, dog_image_url'
    )
    .in('class_id', classIds)
    .gte('final_placement', 1)
    .lte('final_placement', 4)
    .order('final_placement', { ascending: true });

  const { data: qualifiedRows } = await supabase
    .from('view_public_entry_results')
    .select('class_id, search_time_seconds, entry_status, check_in_status')
    .in('class_id', classIds)
    .eq('result_status', 'qualified');

  // An entry that was scored and only later withdrawn, scratched or pulled is
  // excluded from `entry_count` by tv_class_entry_counts, so it must drop out of
  // the placements and qualified tally too — otherwise the overlay reports
  // "1 entries • 1 qualified" about a dog that is no longer in the show.
  //
  // Filtered here with the canonical `isExpectedEntry` rather than as PostgREST
  // predicates: these columns are free text, so a filter written in query syntax
  // would be a fourth copy of the rule with its own casing and null handling.
  // One rule, one implementation — that is the whole point of entryAccounting.
  // The view returns these columns as `string | null`; EntryAccountingFields
  // declares them `string | undefined`. Adapt explicitly rather than casting —
  // a cast here would silently pass `null` into `normalized()` if the shared
  // interface ever tightened.
  const isActiveResultRow = (row: {
    entry_status: string | null;
    check_in_status: string | null;
  }) =>
    isExpectedEntry({
      entry_status: row.entry_status ?? undefined,
      check_in_status: row.check_in_status ?? undefined,
    });

  const placementData = (placementRows ?? []).filter(isActiveResultRow);
  const qualifiedData = (qualifiedRows ?? []).filter(isActiveResultRow);

  const placementsByClass = new Map<string, TVPlacement[]>();
  for (const p of placementData) {
    const classId = p.class_id as string;
    const group = placementsByClass.get(classId) ?? [];
    group.push({
      placement: p.final_placement!,
      armband: p.armband,
      handler: p.handler,
      searchTime: p.search_time_seconds,
      totalScore: p.total_score,
      dog: mapJoinedDog({
        name: p.dog_name as string,
        call_name: (p.dog_call_name as string | null) ?? null,
        image_url: (p.dog_image_url as string | null) ?? null,
      }),
    });
    placementsByClass.set(classId, group);
  }

  const qualifiedByClass = new Map<string, { count: number; fastest: number | null }>();
  for (const q of qualifiedData) {
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
      totalEntries: entryCounts?.get(c.id) ?? null,
      qualifiedCount: stats?.count ?? 0,
      fastestTime: stats?.fastest ?? null,
      placements: placementsByClass.get(c.id) ?? [],
    };
  });
}
