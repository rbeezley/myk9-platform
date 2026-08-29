import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getTrialsByShow } from '@/services/database/trials';
import { getClassesByTrialId } from '@/services/database/classes';
import { pickLandingTrials } from '@/pages/ShowDetailsPage.landingTrials';
import {
  buildPublicShowClasses,
  buildPublicTrialStats,
  type TrialClassRows,
} from '@/pages/ShowDetailsPage.publicClasses';
import type { Trial } from '@/components/trials/types/trial.types';
import type { ClassInfo } from '@/components/shows/tabs/ClassesTab';
import type { TrialStats } from '@/components/shows/tabs/TrialsTab';

/**
 * Anon / cold-store fallback data layer for the public show surface.
 *
 * The trial + trial-class stores are fed by the replication layer, which does
 * NOT sync for guests (ReplicationSyncProvider skips guest sync) — so a cold
 * signed-out visitor has zero replicated trials/classes even though the public
 * show loaded. `getTrialsByShow` / `getClassesByTrialId` self-fall-through to a
 * direct anon-safe PostgREST read when the show isn't in the replicated store,
 * so we enable them only when the store is cold (`associatedTrials.length === 0`)
 * and reshape the rows into the `Trial[]` / `ClassInfo[]` / `TrialStats` the
 * landing + tabs expect. Warm/authenticated sessions never enable these queries
 * and keep using the store-derived data unchanged. (Lane 3.7)
 *
 * Extracted verbatim from ShowDetailsPage so the public read path is a single,
 * test-backed unit. The page still owns the warm-vs-cold *merge* (it needs the
 * store-derived `showClasses` / `trialStats`); this hook owns only the cold path.
 */
export interface ShowLandingData {
  /**
   * The trials the public styled landing should render: the store rows when
   * warm, the anon-safe public rows when cold.
   */
  landingTrials: Trial[];
  /** Cold-store class reshape for the Classes tab + overview. */
  publicShowClasses: ClassInfo[];
  /** Cold-store per-trial stat cards for the Trials tab. */
  publicTrialStats: Record<string, TrialStats>;
  /**
   * Whether the cold/anon class read has settled successfully. `true` when the
   * read is not needed at all. Callers use it to keep an empty class list
   * distinguishable from an unread one.
   */
  publicClassInventoryResolved: boolean;
}

export function useShowLandingData(
  showId: string | undefined,
  associatedTrials: Trial[],
  showEntries: Record<string, unknown>[] | null
): ShowLandingData {
  // Public/anon fallback for trials. The trial store (associatedTrials) is fed by the
  // replication layer, which does NOT sync for guests — so a cold signed-out visitor on a
  // public styled landing has zero replicated trials even though the public show loaded.
  // getTrialsByShow self-falls-through to a direct PostgREST read when the show isn't in the
  // replicated store, so it works for anon. We only enable it when the store is empty, then
  // map the rows to the Trial[] the landing expects.
  const { data: publicTrialsResult } = useQuery({
    queryKey: ['public-show-trials', showId],
    queryFn: () => getTrialsByShow(showId as string),
    enabled: !!showId && associatedTrials.length === 0,
    staleTime: 60_000,
  });
  const landingTrials = useMemo(
    () => pickLandingTrials(associatedTrials, publicTrialsResult?.data),
    [associatedTrials, publicTrialsResult]
  );

  // Public/anon fallback for trial *classes*. Same cold-store gap as trials:
  // a logged-out guest on a DEFAULT-style show falls to the tabbed UI whose
  // Trials/Classes tabs read the cold trialClasses store. getClassesByTrialId
  // self-falls-through to a direct anon-safe PostgREST read, so fetch per
  // landing trial when the store is cold, then reshape to the tab's ClassInfo.
  const landingTrialIdsKey = useMemo(() => landingTrials.map(t => t.id).join(','), [landingTrials]);
  const { data: publicClassesByTrial, isSuccess: publicClassesLoaded } = useQuery<TrialClassRows[]>(
    {
      queryKey: ['public-show-classes', showId, landingTrialIdsKey],
      queryFn: async () => {
        const results = await Promise.all(
          landingTrials.map(async trial => {
            const { data, error } = await getClassesByTrialId(trial.id);
            // The service returns { data: [], error } on a fallback failure — NOT a
            // throw. Swallowing that error would turn a failed read into a silent
            // empty tab, re-creating the exact false-empty bug this query fixes.
            // Throw so React Query surfaces the error (and retries) instead.
            if (error) throw error;
            return { trialId: trial.id, rows: (data ?? []) as Record<string, unknown>[] };
          })
        );
        return results;
      },
      enabled: !!showId && associatedTrials.length === 0 && landingTrials.length > 0,
      staleTime: 60_000,
    }
  );

  // Anon/cold-store fallback for the Classes tab + overview. When the store has
  // trials the page keeps the store-derived classes verbatim (warm session, no
  // behavior change); only a cold guest swaps in this public PostgREST reshape.
  const publicShowClasses = useMemo(
    () => buildPublicShowClasses(landingTrials, publicClassesByTrial ?? [], showEntries),
    [landingTrials, publicClassesByTrial, showEntries]
  );

  // Same cold-store fallback for the Trials tab's per-trial stat cards.
  const publicTrialStats = useMemo(
    () => buildPublicTrialStats(publicClassesByTrial ?? [], showEntries),
    [publicClassesByTrial, showEntries]
  );

  /**
   * Whether the cold/anon class read has actually SETTLED successfully.
   *
   * The page needs this to keep `hasEntryClassInventory` honest: an empty class
   * list during the two serial round trips below is "not known yet", not "this
   * show has no classes". Reporting the latter hides the entry CTA on a public
   * landing and, on the authed surface, tells an exhibitor the show cannot be
   * entered.
   *
   * `true` when the query is not needed (the warm store already has trials), so
   * callers can treat this as "the cold path has nothing outstanding".
   */
  const publicClassInventoryResolved =
    associatedTrials.length > 0 || landingTrials.length === 0 ? true : publicClassesLoaded;

  return { landingTrials, publicShowClasses, publicTrialStats, publicClassInventoryResolved };
}
