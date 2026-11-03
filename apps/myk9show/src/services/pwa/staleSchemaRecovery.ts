/**
 * Recovery when the offline database and the running build disagree (MYK9-1663).
 *
 * `@myk9/replication` signals when this build is older than the device's
 * database (open fails with VersionError) or when a newer build upgraded it
 * under us (versionchange). Either way the offline store is closed until the
 * app reloads onto the newer build.
 *
 * INTENT: a judge mid-scoresheet is never reloaded by surprise. On a sensitive
 * route either signal only shows a persistent "reload when ready" message; the
 * queued scores stay safe in the newer build's database. Elsewhere we reload at
 * most once per window, and only if that window can be recorded, so a stale
 * cache or blocked sessionStorage cannot loop.
 */

import { toast } from 'sonner';
import { onStaleSchema, type StaleSchemaReason } from '@myk9/replication';
import { applyPwaUpdate, checkForPwaUpdate, isOnSensitiveRoute } from '@/services/pwa/pwaUpdate';
import { logger } from '@/services/LoggingService';

export const STALE_SCHEMA_GUARD_KEY = 'myk9:stale-schema-reload-at';
export const STALE_SCHEMA_GUARD_WINDOW_MS = 5 * 60 * 1000;
const RELOAD_FALLBACK_MS = 3000;
const TOAST_ID = 'stale-schema';

export interface StaleSchemaDeps {
  now: () => number;
  readGuard: () => number | null;
  /** Returns false when the guard could not be persisted. */
  writeGuard: (at: number) => boolean;
  isSensitiveRoute: () => boolean;
  /** Ask the service worker for the newest build and reload onto it. */
  updateAndReload: () => Promise<void>;
  showReloading: () => void;
  showReloadPrompt: () => void;
}

const reloadNow = (): void => window.location.reload();

const defaultDeps: StaleSchemaDeps = {
  now: () => Date.now(),
  readGuard: () => {
    try {
      const raw = window.sessionStorage.getItem(STALE_SCHEMA_GUARD_KEY);
      const at = raw === null ? NaN : Number(raw);
      return Number.isFinite(at) ? at : null;
    } catch {
      return null;
    }
  },
  writeGuard: at => {
    try {
      window.sessionStorage.setItem(STALE_SCHEMA_GUARD_KEY, String(at));
      return true;
    } catch {
      // Storage blocked: without a persisted guard a stale cache would reload forever.
      return false;
    }
  },
  isSensitiveRoute: isOnSensitiveRoute,
  updateAndReload: async () => {
    // Reload even if the service worker has nothing waiting or is unreachable.
    const fallback = setTimeout(reloadNow, RELOAD_FALLBACK_MS);
    try {
      await checkForPwaUpdate();
      await applyPwaUpdate();
    } catch (error) {
      logger.warn('Stale schema update failed, reloading', 'pwa', { data: error });
      clearTimeout(fallback);
      reloadNow();
    }
  },
  showReloading: () => {
    toast('myK9Show was updated. Reloading…', { id: TOAST_ID, duration: Infinity });
  },
  showReloadPrompt: () => {
    toast('myK9Show was updated', {
      id: TOAST_ID,
      description: 'Reload when you are ready to use the latest version.',
      duration: Infinity,
      action: { label: 'Reload', onClick: reloadNow },
    });
  },
};

let reloadStarted = false;

/** Test-only: forget that this page already started a reload. */
export function resetStaleSchemaRecoveryForTests(): void {
  reloadStarted = false;
}

/** Decide what to do about one stale-schema signal. Exported for tests. */
export function handleStaleSchema(
  reason: StaleSchemaReason,
  deps: StaleSchemaDeps = defaultDeps
): 'reloading' | 'prompted' | 'ignored' {
  // A reload is already under way; a second toast would replace "Reloading…".
  if (reloadStarted) return 'ignored';
  logger.warn('Offline database schema is stale', 'pwa', { data: { reason } });

  if (deps.isSensitiveRoute()) {
    deps.showReloadPrompt();
    return 'prompted';
  }

  const now = deps.now();
  const last = deps.readGuard();
  if (last !== null && now - last < STALE_SCHEMA_GUARD_WINDOW_MS) {
    deps.showReloadPrompt();
    return 'prompted';
  }

  if (!deps.writeGuard(now)) {
    deps.showReloadPrompt();
    return 'prompted';
  }
  reloadStarted = true;
  deps.showReloading();
  void deps.updateAndReload();
  return 'reloading';
}

/** Subscribe once at startup. Returns the unsubscribe function. */
export function setupStaleSchemaRecovery(): () => void {
  return onStaleSchema(reason => {
    handleStaleSchema(reason);
  });
}
