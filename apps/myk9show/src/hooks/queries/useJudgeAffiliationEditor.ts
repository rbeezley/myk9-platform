import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useIsOnline } from '@/hooks/useNetworkStatus';
import {
  fetchShowJudgeAffiliationEditor,
  type JudgeAffiliationEditorEntry,
} from '@/services/database/judges/judgeAffiliations';
import { PREMIUM_JUDGE_AFFILIATIONS_KEY } from '@/services/database/judges/judgeAffiliationKeys';

/**
 * - `ready`: the server holds a live assignment for this judge on this show, so the
 *   `set_judge_affiliation` RPC will accept the save;
 * - `waiting`: not on the server yet (ticked but unsaved, or the upload not acknowledged), or
 *   the server could not be read;
 * - `offline`: no connection, so nothing can be confirmed or saved;
 * - `inactive`: only declined or cancelled assignments; the judge does not print.
 */
export type JudgeAffiliationReadiness = 'ready' | 'waiting' | 'offline' | 'inactive';

/**
 * Under the premium checklist's key prefix, so every sync pass that lands a judge, person,
 * class or trial upload refreshes it (replicationSyncStatus); it also re-reads on every mount.
 */
export const judgeAffiliationEditorKey = (showId: string) =>
  [PREMIUM_JUDGE_AFFILIATIONS_KEY, 'editor', showId] as const;

/**
 * MYK9-2294: one judge's affiliation field state on one show, from ONE server read per show
 * that every judge row shares. The server, not this device's queue, decides readiness, because
 * the server is what the RPC checks. A failed read is never a pass.
 */
export function useJudgeAffiliationEditor(showId: string | undefined, personId: string) {
  const queryClient = useQueryClient();
  const isOnline = useIsOnline();
  const query = useQuery({
    queryKey: judgeAffiliationEditorKey(showId ?? ''),
    queryFn: () => fetchShowJudgeAffiliationEditor(showId ?? ''),
    enabled: showId !== undefined,
    // Never trust a cached "not on the server yet": the app's default staleTime would keep it for
    // ten minutes after an upload acknowledged while the panel was closed.
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const entry: JudgeAffiliationEditorEntry | undefined = query.data?.[personId];

  let readiness: JudgeAffiliationReadiness = 'waiting';
  if (!isOnline) readiness = 'offline';
  else if (!query.isError && entry) readiness = entry.status;

  /** After an acknowledged save: show the saved value at once, whatever a refetch does. */
  const showSaved = useCallback(
    (affiliation: string | null) => {
      if (!showId) return;
      queryClient.setQueryData<Record<string, JudgeAffiliationEditorEntry>>(
        judgeAffiliationEditorKey(showId),
        entries =>
          entries?.[personId]
            ? { ...entries, [personId]: { ...entries[personId], affiliation } }
            : entries
      );
    },
    [queryClient, showId, personId]
  );

  return { readiness, affiliation: entry?.affiliation ?? null, showSaved };
}
