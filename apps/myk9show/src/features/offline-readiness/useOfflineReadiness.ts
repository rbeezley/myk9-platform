import { useCallback, useEffect, useRef, useState } from 'react';
import {
  replicatedClassesTable,
  replicatedEntriesTable,
  replicatedTrialsTable,
} from '@/services/replication';
import { loadRbacPermissionsCache } from '@/context/rbacPermissionsCache';
import { syncAtShowData } from '@/features/at-show/atShowDataAdapter';
import { useAuthContext } from '@/hooks/useAuthContext';
import {
  computeOfflineReadiness,
  type OfflineReadiness,
  type ScopeReadiness,
} from './computeOfflineReadiness';

interface ScopedMeta {
  totalRows?: number;
  lastIncrementalSyncAt?: number;
}

function toScope(label: string, meta: ScopedMeta | null): ScopeReadiness {
  const hydrated = meta?.totalRows !== undefined;
  return {
    label,
    hydrated,
    lastSyncAt: hydrated ? (meta?.lastIncrementalSyncAt ?? null) : null,
  };
}

async function gatherReadiness(showId: string, userId: string): Promise<OfflineReadiness> {
  const cacheEntry = loadRbacPermissionsCache(userId);
  const permissionsCachedAt = cacheEntry ? Date.parse(cacheEntry.cachedAt) : null;

  const [trialsMeta, entriesMeta] = await Promise.all([
    replicatedTrialsTable.getSyncMetadata(showId) as Promise<ScopedMeta | null>,
    replicatedEntriesTable.getSyncMetadata(showId) as Promise<ScopedMeta | null>,
  ]);

  const scopes: ScopeReadiness[] = [toScope('trials', trialsMeta), toScope('entries', entriesMeta)];

  // Classes are scoped by TRIAL id, so a truthful per-show answer fans out
  // over the show's trials — every trial's classes must be hydrated. Until the
  // trials scope itself is hydrated the fan-out is unknowable: report cold.
  if (trialsMeta?.totalRows !== undefined) {
    const trials = await replicatedTrialsTable.getTrialsByShow(showId);
    const classMetas = (await Promise.all(
      trials.map(trial => replicatedClassesTable.getSyncMetadata(trial.id))
    )) as Array<ScopedMeta | null>;
    const allHydrated = classMetas.every(meta => meta?.totalRows !== undefined);
    const watermarks = classMetas
      .map(meta => meta?.lastIncrementalSyncAt)
      .filter((t): t is number => typeof t === 'number');
    scopes.push({
      label: 'classes',
      hydrated: allHydrated,
      lastSyncAt: allHydrated && watermarks.length > 0 ? Math.min(...watermarks) : null,
    });
  } else {
    scopes.push({ label: 'classes', hydrated: false, lastSyncAt: null });
  }

  return computeOfflineReadiness({ permissionsCachedAt, scopes });
}

/**
 * Per-show offline readiness for the badge (MYK9-203): does THIS device hold
 * the permissions cache and this show's replicated data? Recomputes on mount,
 * window focus, reconnect, and after prime(). `prime()` runs the canonical
 * at-show hydration for the show, then re-checks.
 */
export function useOfflineReadiness(showId: string | undefined) {
  const { user } = useAuthContext();
  const userId = user?.id;
  const [readiness, setReadiness] = useState<OfflineReadiness | null>(null);
  const [checking, setChecking] = useState(false);
  const [priming, setPriming] = useState(false);
  const generationRef = useRef(0);

  const check = useCallback(async () => {
    if (!showId || !userId) {
      setReadiness(null);
      return;
    }
    const generation = ++generationRef.current;
    setChecking(true);
    try {
      const result = await gatherReadiness(showId, userId);
      if (generationRef.current === generation) setReadiness(result);
    } finally {
      if (generationRef.current === generation) setChecking(false);
    }
  }, [showId, userId]);

  useEffect(() => {
    void check();
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
    if (!showId) return;
    setPriming(true);
    try {
      await syncAtShowData(showId);
    } finally {
      setPriming(false);
    }
    await check();
  }, [showId, check]);

  return { readiness, checking, priming, prime };
}
