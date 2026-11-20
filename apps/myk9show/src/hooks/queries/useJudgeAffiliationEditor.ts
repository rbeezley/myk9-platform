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
 * - `waiting`: not on the server yet (ticked but unsaved, or the upload not acknowledged);
 * - `checking`: the first read (or a retry with nothing read yet) is in flight;
 * - `error`: the server could not be read, so readiness is unknown (MYK9-2297);
 * - `offline`: no connection, so nothing can be confirmed or saved;
 * - `inactive`: only declined or cancelled assignments; the judge does not print.
 */
export type JudgeAffiliationReadiness =
  'ready' | 'waiting' | 'checking' | 'error' | 'offline' | 'inactive';

/**
 * Under the premium checklist's key prefix, so every sync pass that lands a judge, person,
 * class or trial upload refreshes it (replicationSyncStatus).
 */
export const judgeAffiliationEditorKey = (showId: string) =>
  [PREMIUM_JUDGE_AFFILIATIONS_KEY, 'editor', showId] as const;

const rosterQuery = (showId: string | undefined) => ({
  queryKey: judgeAffiliationEditorKey(showId ?? ''),
  queryFn: () => fetchShowJudgeAffiliationEditor(showId ?? ''),
  enabled: showId !== undefined,
  // Never trust a cached "not on the server yet": the app's default staleTime would keep it for
  // ten minutes after an upload acknowledged while the panel was closed.
  staleTime: 0,
});

/**
 * MYK9-2297: the one read of a show's judge roster, mounted once by Edit show's Judges tab, so
 * opening (or reopening) the tab re-reads it and ticking another judge does not.
 */
export function useJudgeAffiliationRoster(showId: string | undefined) {
  const isOnline = useIsOnline();
  const { isError, isFetching, refetch } = useQuery({
    ...rosterQuery(showId),
    refetchOnMount: 'always',
  });
  // Offline, each field already says to reconnect; the read error is for an online failure.
  return { readFailed: isOnline && isError, isReading: isFetching, retry: refetch };
}

/**
 * MYK9-2294: one judge's affiliation field state on one show, selected from the roster read
 * that `useJudgeAffiliationRoster` owns. The server, not this device's queue, decides readiness,
 * because the server is what the RPC checks. A failed read is never a pass.
 */
export function useJudgeAffiliationEditor(showId: string | undefined, personId: string) {
  const queryClient = useQueryClient();
  const isOnline = useIsOnline();
  // A row mounting never re-reads (MYK9-2297); it loads only if the roster has no data yet.
  const query = useQuery({ ...rosterQuery(showId), refetchOnMount: false, retryOnMount: false });
  const entry: JudgeAffiliationEditorEntry | undefined = query.data?.[personId];

  let readiness: JudgeAffiliationReadiness = 'waiting';
  if (!isOnline) readiness = 'offline';
  else if (query.isError) readiness = 'error';
  else if (showId !== undefined && query.data === undefined) readiness = 'checking';
  else if (entry) readiness = entry.status;

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
