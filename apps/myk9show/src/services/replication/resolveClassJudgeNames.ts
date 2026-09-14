import { supabase } from '@/services/database/supabaseClient';
import { logger } from '@/utils/logger';
import {
  fetchShowJudgeNameParts,
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
 * The result distinguishes three states per class, and the distinction is the whole point:
 *
 *   * a `JudgeNameParts` value — a confirmed judge;
 *   * `null` — the RPC ran for this class's show and found no confirmed judge;
 *   * ABSENT — the RPC never ran (network, authorization, a trial whose show is unknown).
 *
 * Without the third state a transient RPC failure on an incremental sync would commit
 * `judgeName: undefined` over a correct cached name and regress the schedule to `Judge TBD`
 * (see `ReplicatedClassesTable.resolveConflict`). Enrichment stays best-effort: a judge-name
 * failure must never break class replication.
 */
export async function resolveJudgeNamesForClassRows(
  rows: ReadonlyArray<JudgeNameClassRow>
): Promise<Map<string, JudgeNameParts | null>> {
  const byClassId = new Map<string, JudgeNameParts | null>();

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

  const showIdByTrialId = new Map<string, string>();
  for (const trial of (data ?? []) as Array<{ id: string; show_id: string | null }>) {
    if (trial.show_id) showIdByTrialId.set(trial.id, trial.show_id);
  }

  const partsByShowId = new Map<string, Map<string, JudgeNameParts>>();
  await Promise.all(
    [...new Set(showIdByTrialId.values())].map(async showId => {
      const parts = await fetchShowJudgeNameParts(showId);
      // null = the RPC failed. Leave the show out, so its classes stay ABSENT from the result
      // and every reader keeps whatever it already had.
      if (parts) partsByShowId.set(showId, parts);
    })
  );

  for (const row of rows) {
    const showId = row.trial_id ? showIdByTrialId.get(row.trial_id) : undefined;
    if (!showId) continue;
    const parts = partsByShowId.get(showId);
    if (!parts) continue;
    byClassId.set(row.id, parts.get(row.id) ?? null);
  }

  return byClassId;
}
