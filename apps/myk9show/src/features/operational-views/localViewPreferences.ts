/**
 * Personal saved-view local preferences (Design Decision 2, spec Requirement
 * "Personal saved views are explicit and local"). No database table, no React
 * — pure functions over an injectable storage backend so callers (and tests)
 * control side effects explicitly. Nothing here touches storage at import
 * time.
 *
 * Key namespace: `operational-views:v{serializationVersion}:{userId}:{surface}`.
 * The version segment means a version bump naturally orphans old keys instead
 * of requiring a migration; `pruneAccountViews`/`clearAccountViews` sweep old
 * versions too so stale entries don't leak storage.
 */

import {
  OPERATIONAL_VIEW_SERIALIZATION_VERSION,
  isOperationalViewSurfaceId,
  validateOperationalView,
  type OperationalView,
  type OperationalViewSurfaceId,
} from './operationalViews';

/** Minimal storage contract — satisfied by `window.localStorage` but injectable for tests / storage-unavailable fallback. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

export interface SavedViewShowScope {
  showId: string;
  trialId?: string;
  classId?: string;
}

export interface SavedViewRecord {
  version: number;
  userId: string;
  surface: OperationalViewSurfaceId;
  /** Show scope the view was saved under. Restore is rejected if this doesn't match the current show. */
  showScope: SavedViewShowScope;
  view: OperationalView;
  savedAt: string;
}

const NAMESPACE_PREFIX = 'operational-views';

export function buildSavedViewKey(
  userId: string,
  surface: OperationalViewSurfaceId,
  version: number = OPERATIONAL_VIEW_SERIALIZATION_VERSION
): string {
  return `${NAMESPACE_PREFIX}:v${version}:${userId}:${surface}`;
}

/** Best-effort storage access. Returns null (not a throw) when storage is unavailable/blocked — callers treat this as "no saved view." */
function safeGetStorage(storage: KeyValueStorage | undefined | null): KeyValueStorage | null {
  if (!storage) return null;
  try {
    // Probe with a throwaway op so a storage backend that throws on access
    // (e.g. Safari private mode, disabled cookies) is caught here rather than
    // at every call site.
    const probeKey = `${NAMESPACE_PREFIX}:__probe__`;
    storage.setItem(probeKey, '1');
    storage.removeItem(probeKey);
    return storage;
  } catch {
    return null;
  }
}

/**
 * Save a validated view for a user/surface/show scope. Silently no-ops if
 * storage is unavailable — saving is a convenience, never a blocking
 * requirement (spec: "Local saved view is unavailable").
 */
export function saveLocalView(
  storage: KeyValueStorage | undefined | null,
  userId: string,
  showScope: SavedViewShowScope,
  view: OperationalView
): void {
  const safeStorage = safeGetStorage(storage);
  if (!safeStorage || !userId) return;

  // Persist the scope with the view itself so reapplying it can restore the
  // exact trial/class context, not just the filters and display settings.
  const validated = validateOperationalView({ ...view, scope: showScope });
  if (!validated) return;

  const record: SavedViewRecord = {
    version: OPERATIONAL_VIEW_SERIALIZATION_VERSION,
    userId,
    surface: validated.surface,
    showScope,
    view: validated,
    savedAt: new Date().toISOString(),
  };

  try {
    safeStorage.setItem(
      buildSavedViewKey(userId, validated.surface),
      JSON.stringify(record)
    );
  } catch {
    // Quota exceeded or backend rejected the write — treat as unavailable.
  }
}

/**
 * Restore a saved view, revalidating user, surface, serialization version,
 * and current show scope. Returns null (and removes the stored entry) for
 * any mismatch or invalid data — restore never applies unvalidated state.
 */
export function restoreLocalView(
  storage: KeyValueStorage | undefined | null,
  userId: string,
  surface: OperationalViewSurfaceId,
  currentShowScope: SavedViewShowScope
): OperationalView | null {
  const safeStorage = safeGetStorage(storage);
  if (!safeStorage || !userId) return null;

  const key = buildSavedViewKey(userId, surface);
  const raw = safeStorage.getItem(key);
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    safeStorage.removeItem(key);
    return null;
  }

  if (!parsed || typeof parsed !== 'object') {
    safeStorage.removeItem(key);
    return null;
  }
  const record = parsed as Partial<SavedViewRecord>;

  if (
    record.version !== OPERATIONAL_VIEW_SERIALIZATION_VERSION ||
    record.userId !== userId ||
    record.surface !== surface ||
    !isOperationalViewSurfaceId(record.surface)
  ) {
    safeStorage.removeItem(key);
    return null;
  }

  if (!isSameShowScope(record.showScope, currentShowScope)) {
    safeStorage.removeItem(key);
    return null;
  }

  // Older records from this serialization version kept scope only beside the
  // view. Merge it back at the validation boundary so those records restore
  // correctly without a destructive version bump.
  const validated = validateOperationalView({
    ...record.view,
    scope: record.showScope,
  });
  if (!validated || validated.surface !== surface) {
    safeStorage.removeItem(key);
    return null;
  }

  return validated;
}

function isSameShowScope(
  stored: SavedViewShowScope | undefined,
  current: SavedViewShowScope
): boolean {
  if (!stored || typeof stored !== 'object') return false;
  if (stored.showId !== current.showId) return false;
  // Trial/class scope is only compared when the current scope specifies one;
  // an unscoped current view accepts any stored trial/class as long as the
  // show matches; applying the restored view reinstates that narrower scope.
  if (current.trialId && stored.trialId !== current.trialId) return false;
  if (current.classId && stored.classId !== current.classId) return false;
  return true;
}

/** Remove the saved view for one user/surface (any stored version). Used when an entry is confirmed invalid/cross-show. */
export function clearLocalView(
  storage: KeyValueStorage | undefined | null,
  userId: string,
  surface: OperationalViewSurfaceId
): void {
  const safeStorage = safeGetStorage(storage);
  if (!safeStorage || !userId) return;
  safeStorage.removeItem(buildSavedViewKey(userId, surface));
}

/**
 * Account-change reset: remove every namespaced saved-view key belonging to
 * `userId` (all surfaces, current version). Call when the authenticated user
 * changes on a shared device so a prior user's saved views are never listed
 * or restored under the new session (spec: "Another user signs in on the
 * same device").
 */
export function clearAllLocalViewsForUser(
  storage: KeyValueStorage | undefined | null,
  userId: string
): void {
  const safeStorage = safeGetStorage(storage);
  if (!safeStorage || !userId) return;

  const suffix = `:${userId}:`;
  const keysToRemove: string[] = [];
  for (let i = 0; i < safeStorage.length; i++) {
    const key = safeStorage.key(i);
    if (key && key.startsWith(`${NAMESPACE_PREFIX}:`) && key.includes(suffix)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => safeStorage.removeItem(key));
}
