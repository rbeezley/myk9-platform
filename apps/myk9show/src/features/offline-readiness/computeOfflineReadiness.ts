/**
 * Pure readiness decision for the "Offline ready" badge (MYK9-203).
 *
 * A device can run a show offline only when BOTH halves are on disk: the
 * user's permissions cache (MYK9-200) and every replication scope the show's
 * surfaces read (trials + per-trial classes + entries). The global sync
 * status is deliberately not consulted — it is unscoped and can report
 * "synced" while this particular show has never been hydrated.
 */

export interface ScopeReadiness {
  /** Human-readable scope name, surfaced in `missing` (e.g. 'trials'). */
  label: string;
  /** False when the scope has never completed a sync on this device. */
  hydrated: boolean;
  /** Scope watermark (ms epoch); null when never synced. */
  lastSyncAt: number | null;
}

export interface OfflineReadiness {
  ready: boolean;
  /** Which signals are missing — 'permissions' and/or cold scope labels. */
  missing: string[];
  /** Oldest timestamp across all signals — the honest "as of". Null unless ready. */
  asOf: number | null;
}

export function computeOfflineReadiness({
  permissionsCachedAt,
  scopes,
}: {
  /** ms epoch of the persisted RBAC cache entry, or null when absent. */
  permissionsCachedAt: number | null;
  scopes: ScopeReadiness[];
}): OfflineReadiness {
  const missing: string[] = [];
  if (permissionsCachedAt === null) missing.push('permissions');
  for (const scope of scopes) {
    if (!scope.hydrated) missing.push(scope.label);
  }

  // Zero scopes means nothing was measured — never report ready on no evidence.
  const ready = missing.length === 0 && scopes.length > 0;
  if (!ready) return { ready, missing, asOf: null };

  const timestamps = [
    permissionsCachedAt as number,
    ...scopes.map(scope => scope.lastSyncAt).filter((t): t is number => t !== null),
  ];
  return { ready, missing, asOf: Math.min(...timestamps) };
}
