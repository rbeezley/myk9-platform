import { useCallback, useEffect, useRef, useState } from 'react';
import {
  replicatedClassesTable,
  replicatedEntriesTable,
  replicatedJudgeAssignmentsTable,
  replicatedShowsTable,
  replicatedTrialsTable,
} from '@/services/replication';
import { getActiveJudgeAssignmentsForShow } from '@/services/database/judges/assignmentReads';
import { isJudgeOnlyAtShow } from '@/features/at-show/isJudgeOnlyAtShow';
import { loadRbacPermissionsCache } from '@/context/rbacPermissionsCache';
import { syncAtShowData } from '@/features/at-show/atShowDataAdapter';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useOptionalReplicationSync } from '@/hooks/useOptionalReplicationSync';
import { logger } from '@/services/LoggingService';
import {
  computeOfflineReadiness,
  type OfflineReadiness,
  type ScopeReadiness,
} from './computeOfflineReadiness';

interface ScopedMeta {
  totalRows?: number;
  lastIncrementalSyncAt?: number;
}

/**
 * A scope counts as hydrated only when its watermark exists AND the local row
 * count has not fallen below what that watermark recorded — quota eviction
 * deletes cached rows without touching the metadata, and a badge that says
 * "Offline ready" over an evicted store is worse than no badge. A zero
 * watermark (synced-but-empty shape) is treated as "time unknown", never as
 * epoch 1970.
 */
function toScope(label: string, meta: ScopedMeta | null, localRowCount: number): ScopeReadiness {
  const hydrated = meta?.totalRows !== undefined && localRowCount >= meta.totalRows;
  return {
    label,
    hydrated,
    lastSyncAt: hydrated ? meta?.lastIncrementalSyncAt || null : null,
  };
}

async function gatherReadiness(
  showId: string,
  userId: string,
  judge: { required: boolean; personId: string | null }
): Promise<OfflineReadiness> {
  const cacheEntry = loadRbacPermissionsCache(userId);
  const permissionsCachedAt = cacheEntry ? Date.parse(cacheEntry.cachedAt) : null;

  const [trialsMeta, entriesMeta, trialRows, entryRows, showRow] = await Promise.all([
    replicatedTrialsTable.getSyncMetadata(showId) as Promise<ScopedMeta | null>,
    replicatedEntriesTable.getSyncMetadata(showId) as Promise<ScopedMeta | null>,
    replicatedTrialsTable.getTrialsByShow(showId),
    replicatedEntriesTable.getEntriesByShow(showId),
    replicatedShowsTable.getShowById(showId),
  ]);

  const trialsScope = toScope('trials', trialsMeta, trialRows.length);
  const scopes: ScopeReadiness[] = [
    // The show row itself is load-bearing offline — /at-show/:showId reads
    // replicatedShowsTable.getShowById. Shows sync is CLUB-scoped, so check
    // row presence directly rather than a per-show watermark.
    { label: 'show', hydrated: showRow !== null, lastSyncAt: null },
    trialsScope,
    toScope('entries', entriesMeta, entryRows.length),
  ];

  // Classes are scoped by TRIAL id, so a truthful per-show answer fans out
  // over the show's trials — every trial's classes must be hydrated. Until the
  // trials scope itself is hydrated the fan-out is unknowable: report cold.
  if (trialsScope.hydrated) {
    const perTrial = await Promise.all(
      trialRows.map(async trial => {
        const [classMeta, classRows] = await Promise.all([
          replicatedClassesTable.getSyncMetadata(trial.id) as Promise<ScopedMeta | null>,
          replicatedClassesTable.getClassesByTrial(trial.id),
        ]);
        return toScope('classes', classMeta, classRows.length);
      })
    );
    const allHydrated = perTrial.every(scope => scope.hydrated);
    const watermarks = perTrial
      .map(scope => scope.lastSyncAt)
      .filter((t): t is number => t !== null);
    scopes.push({
      label: 'classes',
      hydrated: allHydrated,
      lastSyncAt: allHydrated && watermarks.length > 0 ? Math.min(...watermarks) : null,
    });
  } else {
    scopes.push({ label: 'classes', hydrated: false, lastSyncAt: null });
  }

  // A judge's at-show surface is driven by useMyAtShowJudgeAssignments; with
  // no cached assignments they see "No classes assigned yet" offline even
  // though the show data is all present. Use the SAME filtered read that
  // surface uses — another judge's assignment, an inactive row, or a
  // show-level row proves nothing about what this judge can open.
  if (judge.required) {
    // Readiness is about the CACHE, not about having work: a judge with no
    // assignment in this show is accurately shown an empty list offline, so
    // table hydration is the right signal. Two exceptions still fail closed —
    // an unhydrated table, and an unresolved identity (databaseUserId comes
    // from the network profile query, not the RBAC cache, so a cold offline
    // boot can leave useMyAtShowJudgeAssignments equally blind).
    const assignmentsMeta = (await replicatedJudgeAssignmentsTable.getSyncMetadata()) as
      | ScopedMeta
      | null;
    if (judge.personId) {
      // Warm the filtered read the at-show surface uses, so a mismatch in that
      // path surfaces here rather than at the ring.
      await getActiveJudgeAssignmentsForShow(showId, judge.personId);
    }
    scopes.push({
      label: 'judge assignments',
      hydrated: Boolean(judge.personId) && assignmentsMeta?.totalRows !== undefined,
      lastSyncAt: null,
    });
  }

  return computeOfflineReadiness({ permissionsCachedAt, scopes });
}

/**
 * Per-show offline readiness for the badge (MYK9-203): does THIS device hold
 * the permissions cache and this show's replicated data? Recomputes on mount,
 * window focus, reconnect, and after prime(). `prime()` runs the canonical
 * at-show hydration AND a permissions refresh (which re-persists the RBAC
 * cache), then re-checks.
 *
 * Anonymous passcode sessions get no readiness at all: they have no RBAC
 * cache and never will, so the badge would be permanently — and wrongly —
 * red for them.
 */
export function useOfflineReadiness(showId: string | undefined) {
  const { user, hasRole, userWithRoles, refreshPermissions } = useAuthContext();
  const userId = user?.id;
  // Only a judge-ONLY account depends on the assignment cache; a secretary who
  // also judges gets the full picker, so demanding assignments from them would
  // be a false red. Same rule as AtShowClassListPage, shared to keep them so.
  const judgeAssignmentsRequired = Boolean(
    user && isJudgeOnlyAtShow({ isAnonymous: Boolean(user.is_anonymous), hasRole })
  );
  const judgePersonId = judgeAssignmentsRequired
    ? (userWithRoles?.databaseUserId ?? null)
    : null;
  const isAnonymous = user?.is_anonymous === true;
  const [readiness, setReadiness] = useState<OfflineReadiness | null>(null);
  const [checking, setChecking] = useState(false);
  const [priming, setPriming] = useState(false);
  const [primeFailed, setPrimeFailed] = useState(false);
  const generationRef = useRef(0);
  // A background sync finishing advances lastSyncAt; re-check then so the
  // badge goes green on its own instead of waiting for a focus or a click.
  const lastSyncAt = useOptionalReplicationSync()?.status?.lastSyncAt ?? null;

  const check = useCallback(async (): Promise<OfflineReadiness | null> => {
    if (!showId || !userId || isAnonymous) {
      setReadiness(null);
      return null;
    }
    const generation = ++generationRef.current;
    setChecking(true);
    try {
      const result = await gatherReadiness(showId, userId, {
        required: judgeAssignmentsRequired,
        personId: judgePersonId,
      });
      if (generationRef.current === generation) setReadiness(result);
      return result;
    } catch (error) {
      // A storage read failed, so readiness is genuinely UNKNOWN — claiming
      // either state would be a lie, and an escaped rejection here would
      // surface as an unhandled rejection from every caller's `void check()`.
      logger.warn('Offline readiness probe failed', 'app', {
        message: error instanceof Error ? error.message : String(error),
      });
      if (generationRef.current === generation) setReadiness(null);
      return null;
    } finally {
      if (generationRef.current === generation) setChecking(false);
    }
  }, [showId, userId, isAnonymous, judgeAssignmentsRequired, judgePersonId]);

  useEffect(() => {
    void check();
  }, [check, lastSyncAt]);

  useEffect(() => {
    const handleRecheck = () => void check();
    window.addEventListener('online', handleRecheck);
    window.addEventListener('focus', handleRecheck);
    return () => {
      generationRef.current += 1;
      window.removeEventListener('online', handleRecheck);
      window.removeEventListener('focus', handleRecheck);
    };
  }, [check]);

  const prime = useCallback(async () => {
    if (!showId || isAnonymous) return;
    setPriming(true);
    setPrimeFailed(false);
    try {
      // Permissions refresh re-persists the RBAC cache (MYK9-200), healing a
      // device whose cache was missing or expired — show data alone is not
      // enough to be offline ready.
      // Rewind the watermark of every cold/short scope before syncing. An
      // incremental sync does not restore rows that quota eviction removed
      // (the engine only force-syncs a COMPLETELY empty replica) and then
      // rewrites totalRows down to the reduced local count — which would turn
      // the badge falsely green. Rewinding re-fetches without clearing rows.
      const missing = readiness?.missing ?? [];
      const REWIND = { lastIncrementalSyncAt: 0, scopes: {} };
      await Promise.all([
        missing.includes('trials') ? replicatedTrialsTable.updateSyncMetadata(REWIND) : null,
        missing.includes('entries') ? replicatedEntriesTable.updateSyncMetadata(REWIND) : null,
        missing.includes('classes') ? replicatedClassesTable.updateSyncMetadata(REWIND) : null,
      ]);
      if (readiness?.missing.includes('show')) {
        await replicatedShowsTable.updateSyncMetadata({
          lastIncrementalSyncAt: 0,
          // sync('') reads scopes['']; resetting only the table-global
          // watermark would still skip the missing show. Clearing the scope
          // map costs a re-fetch, never cached rows.
          scopes: {},
        });
      }
      await Promise.all([
        syncAtShowData(showId),
        // Shows sync is club-scoped; the unscoped incremental sync is what the
        // background provider runs and it carries the show row.
        replicatedShowsTable.sync(''),
        // Judges' at-show view is empty without their assignments cached.
        judgeAssignmentsRequired
          ? replicatedJudgeAssignmentsTable.sync(showId)
          : Promise.resolve(),
        refreshPermissions?.(),
      ]);
    } catch {
      // Priming needs the network, and the likeliest reason someone clicks
      // this badge is that they are already offline. Surface the failure on
      // the badge instead of throwing out of an onClick handler.
      setPrimeFailed(true);
      setPriming(false);
      await check();
      return;
    }
    setPriming(false);
    // Sync methods report network/RLS failures as `{ success: false }` rather
    // than throwing, and refreshPermissions swallows its own errors — so the
    // only trustworthy verdict is the re-check itself. Still not ready after
    // a completed prime means the prime did not work.
    const result = await check();
    setPrimeFailed(result !== null && !result.ready);
  }, [showId, isAnonymous, judgeAssignmentsRequired, readiness, refreshPermissions, check]);

  return { readiness, checking, priming, primeFailed, prime };
}
