import { supabase } from '@/services/database/supabaseClient';
import { logger } from '@/utils/logger';
import {
  fetchJudgeNamePartsByClass,
  type JudgeNameParts,
} from '@/services/database/_shared/judgeNamesByClass';

interface JudgeNameClassRow {
  id: string;
  trial_id?: string | null | undefined;
}

/**
 * Judge-name enrichment for replicated class rows (MYK9-494).
 *
 * The class sync cannot embed `people`: `people_select` admits only the caller's own row and
 * show managers, so an ordinary exhibitor's `people!inner` embed drops the assignment row and
 * every name field lands undefined — `Judge TBD` on every schedule row even though the
 * confirmed assignment is right there. Names therefore come from `get_show_judges`, the
 * SECURITY DEFINER RPC MYK9-474 added for exactly this, resolved once per show and persisted on
 * the local row so the name survives a cold offline warm start.
 *
 * Best-effort, like the other class enrichments: a judge-name failure must not break class
 * replication.
 */
export async function resolveJudgeNamesForClassRows(
  rows: ReadonlyArray<JudgeNameClassRow>
): Promise<Map<string, JudgeNameParts>> {
  const byClassId = new Map<string, JudgeNameParts>();

  const trialIds = [...new Set(rows.map(row => row.trial_id).filter((id): id is string => !!id))];
  if (trialIds.length === 0) return byClassId;

  const { data, error } = await supabase.from('trials').select('id, show_id').in('id', trialIds);

  if (error) {
    logger.warn(
      `[resolveClassJudgeNames] Trial lookup failed; judge names unavailable this sync: ${error.message}`,
      'replication'
    );
    return byClassId;
  }

  const showIds = [
    ...new Set(
      ((data ?? []) as Array<{ show_id: string | null }>)
        .map(trial => trial.show_id)
        .filter((id): id is string => !!id)
    ),
  ];

  await Promise.all(
    showIds.map(async showId => {
      const judgesByClass = await fetchJudgeNamePartsByClass(showId);
      for (const [classId, judge] of judgesByClass) {
        byClassId.set(classId, judge);
      }
    })
  );

  return byClassId;
}
