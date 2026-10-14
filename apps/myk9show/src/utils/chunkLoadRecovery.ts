/**
 * chunkLoadRecovery - one guarded page reload when a route chunk cannot be loaded.
 *
 * Why (MYK9-1188): Chromium caches a FAILED dynamic import per URL for the life of the document,
 * so lazyWithRetry's re-imports never reach the network again (reproduced: 3 `import()` calls of
 * a URL that 404'd once made 1 request and all rejected). A transient failure (service worker
 * installing or updating, a deploy replacing hashed chunks) therefore stays failed until the
 * page reloads. A fresh document recovers it. The service worker is left alone: unregistering it
 * would drop the offline copy of the app, and offline-first is not traded for this recovery.
 *
 * Guards, because a reload is the one thing that can lose work or loop:
 *   - chunk-load errors only (a thrown render error is never a reason to reload);
 *   - never offline (a genuinely unavailable chunk would reload-loop on a ringside device);
 *   - never on a sensitive route (scoring, show-day, checkout; INTENT: the existing boundary and
 *     its Try Again / Reload Page buttons stay in the user's hands there);
 *   - at most one automatic reload per RELOAD_WINDOW_MS, remembered in sessionStorage (it
 *     survives the reload itself), plus an in-memory flag for storage-less contexts.
 */
import { isSensitivePath } from '@/utils/sensitiveRoutes';

export const RECOVERY_STORAGE_KEY = 'myk9:chunk-recovery-reload-at';
export const RELOAD_WINDOW_MS = 60_000;

const CHUNK_ERROR_PATTERNS: readonly RegExp[] = [
  /Failed to fetch dynamically imported module/i, // Chromium, Edge
  /error loading dynamically imported module/i, // Firefox
  /Importing a module script failed/i, // Safari
  /Unable to preload CSS/i, // Vite's CSS preload helper
];

export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === 'ChunkLoadError') return true;
  return CHUNK_ERROR_PATTERNS.some(pattern => pattern.test(error.message));
}

let reloadedThisDocument = false;

function recentlyReloaded(now: number): boolean {
  try {
    const at = Number(window.sessionStorage.getItem(RECOVERY_STORAGE_KEY));
    return Number.isFinite(at) && at > 0 && now - at < RELOAD_WINDOW_MS;
  } catch {
    return false;
  }
}

function rememberReload(now: number): void {
  try {
    window.sessionStorage.setItem(RECOVERY_STORAGE_KEY, String(now));
  } catch {
    // Storage blocked: the in-memory flag still stops a same-document repeat.
  }
}

/** True when an automatic recovery reload is allowed right now for this error. */
export function canRecoverByReload(error: unknown, now: number = Date.now()): boolean {
  if (!isChunkLoadError(error)) return false;
  if (reloadedThisDocument) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  if (isSensitivePath(window.location.pathname)) return false;
  return !recentlyReloaded(now);
}

/**
 * Reload once when the guards allow it.
 * Returns true when a reload was started; the caller should then keep showing its loading
 * state instead of flashing the error boundary.
 */
export function recoverFromChunkLoadError(error: unknown): boolean {
  const now = Date.now();
  if (!canRecoverByReload(error, now)) return false;
  reloadedThisDocument = true;
  rememberReload(now);
  window.location.reload();
  return true;
}

/** Vite fires `vite:preloadError` when a dynamic import's preloaded dependency fails. */
export function installPreloadErrorRecovery(): void {
  window.addEventListener('vite:preloadError', event => {
    const payload = (event as Event & { payload?: unknown }).payload;
    if (recoverFromChunkLoadError(payload)) event.preventDefault();
  });
}

/** Test seam: forget the in-memory once-per-document flag. */
export function __resetChunkRecoveryForTests(): void {
  reloadedThisDocument = false;
}
