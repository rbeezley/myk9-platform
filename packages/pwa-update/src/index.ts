/**
 * Shared PWA update lifecycle for myK9 apps.
 *
 * Implements the prompt-then-skip-waiting pattern:
 *   1. SW installs silently in the background.
 *   2. When a new SW is waiting, fire onPrompt() so the app can show a toast.
 *   3. User clicks "Update" → applyUpdate() posts SKIP_WAITING + reloads on
 *      controllerchange.
 *
 * `virtual:pwa-register` is a virtual module injected by vite-plugin-pwa at
 * build time inside the consuming app, so apps must inject `registerSW`
 * themselves rather than this package importing it.
 */

const DEFAULT_PROMPTED_KEY = 'sw_prompted_version';
const DEFAULT_POLL_INTERVAL_MS = 10 * 60 * 1000;
const DEFAULT_INITIAL_CHECK_DELAY_MS = 5000;
const DEFAULT_DEFERRAL_RETRY_MS = 2000;
const DEFAULT_APPLY_RELOAD_FALLBACK_MS = 3000;

export type UpdateSWFn = (reloadPage?: boolean) => Promise<void>;

export interface RegisterSWOptions {
  onNeedRefresh?: () => void;
  onOfflineReady?: () => void;
  onRegisteredSW?: (
    swUrl: string,
    registration: ServiceWorkerRegistration | undefined
  ) => void;
  onRegisterError?: (error: unknown) => void;
}

export type RegisterSWFn = (options: RegisterSWOptions) => UpdateSWFn;

export interface PwaLogger {
  info: (msg: string, meta?: Record<string, unknown>) => void;
  warn: (msg: string, meta?: Record<string, unknown>) => void;
  error: (msg: string, meta?: Record<string, unknown>) => void;
}

export interface SetupPwaUpdateOptions {
  /** Inject from the consuming app: `import { registerSW } from 'virtual:pwa-register'`. */
  registerSW: RegisterSWFn;
  /** Build-stamp/version string. Used as the prompt-once dedup key. */
  version: string;
  /** Show the prompt UI. */
  onPrompt: () => void;
  /** Optional: notify when the SW is offline-ready. */
  onOfflineReady?: () => void;
  /** Optional: notify with the registration once the SW has registered. */
  onRegistered?: (registration: ServiceWorkerRegistration) => void;
  /** Return true to defer the prompt (e.g. user mid-task). Re-checked every retryMs. */
  shouldDefer?: () => boolean;
  /** Polling cadence for `registration.update()`. Default 10 min. */
  pollIntervalMs?: number;
  /** Delay before first manual update check. Default 5s. */
  initialCheckDelayMs?: number;
  /** How often to re-check shouldDefer once a prompt is queued. Default 2s. */
  deferralRetryMs?: number;
  /** Reload fallback after applying an update. Default 3s. */
  applyReloadFallbackMs?: number;
  /** localStorage key for prompt-once dedup. Default 'sw_prompted_version'. */
  promptedKey?: string;
  /** Optional reload hook for tests. Defaults to window.location.reload. */
  reloadPage?: () => void;
  /** Optional logger. Defaults to no-op. */
  logger?: PwaLogger;
}

export interface PwaUpdateController {
  applyUpdate: () => Promise<void>;
  checkForUpdate: () => Promise<boolean>;
  onUpdateAvailable: (handler: () => void) => () => void;
  /** Test-only — wipe internal state. */
  __reset: () => void;
}

const noopLogger: PwaLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * Module-level singleton, populated by the first `setupPwaUpdate` call.
 * Lets components anywhere in the app call `applyPwaUpdate()` etc.
 * without threading the controller through props.
 */
let activeController: PwaUpdateController | undefined;

/** Apply the waiting update if one exists. Reloads on controllerchange. */
export const applyPwaUpdate = async (): Promise<void> => {
  if (!activeController) {
    if (typeof window !== 'undefined') window.location.reload();
    return;
  }
  await activeController.applyUpdate();
};

/** Force a check for updates. Returns true if a new SW is waiting/installed. */
export const checkForPwaUpdate = async (): Promise<boolean> => {
  if (!activeController) return false;
  return activeController.checkForUpdate();
};

/** Subscribe to update-available events. */
export const onUpdateAvailable = (handler: () => void): (() => void) => {
  if (!activeController) return () => {};
  return activeController.onUpdateAvailable(handler);
};

/** Test-only — wipe the singleton. */
export const __resetPwaUpdateSingleton = (): void => {
  activeController?.__reset();
  activeController = undefined;
};

export const setupPwaUpdate = (opts: SetupPwaUpdateOptions): PwaUpdateController => {
  if (activeController) return activeController;
  const log = opts.logger ?? noopLogger;
  const promptedKey = opts.promptedKey ?? DEFAULT_PROMPTED_KEY;
  const pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const initialCheckDelayMs = opts.initialCheckDelayMs ?? DEFAULT_INITIAL_CHECK_DELAY_MS;
  const deferralRetryMs = opts.deferralRetryMs ?? DEFAULT_DEFERRAL_RETRY_MS;
  const applyReloadFallbackMs =
    opts.applyReloadFallbackMs ?? DEFAULT_APPLY_RELOAD_FALLBACK_MS;
  const reloadPage = (): void => {
    if (opts.reloadPage) {
      opts.reloadPage();
      return;
    }
    window.location.reload();
  };

  let updateSW: UpdateSWFn | undefined;
  let activeRegistration: ServiceWorkerRegistration | undefined;
  let pollIntervalHandle: ReturnType<typeof setInterval> | undefined;
  let initialCheckTimeoutHandle: ReturnType<typeof setTimeout> | undefined;
  let applyReloadFallbackTimeoutHandle: ReturnType<typeof setTimeout> | undefined;
  let updateKnownAvailable = false;
  const updateAvailableHandlers = new Set<() => void>();
  const inMemoryPromptedVersions = new Set<string>();

  const scheduleApplyReloadFallback = (): void => {
    if (applyReloadFallbackTimeoutHandle !== undefined) {
      clearTimeout(applyReloadFallbackTimeoutHandle);
    }
    applyReloadFallbackTimeoutHandle = setTimeout(() => {
      log.info('[PWA] applyUpdate fallback reload fired');
      reloadPage();
    }, applyReloadFallbackMs);
  };

  const safeGetItem = (key: string): string | null => {
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    } catch {
      return null;
    }
  };

  const safeSetItem = (key: string, value: string): void => {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
    } catch {
      /* Safari Private Mode etc. — fall back to in-memory dedup. */
    }
  };

  const hasPromptedForCurrentVersion = (): boolean => {
    if (inMemoryPromptedVersions.has(opts.version)) return true;
    return safeGetItem(promptedKey) === opts.version;
  };

  const markPromptedForCurrentVersion = (): void => {
    inMemoryPromptedVersions.add(opts.version);
    safeSetItem(promptedKey, opts.version);
  };

  const notifyUpdateAvailable = (): void => {
    for (const handler of updateAvailableHandlers) {
      try {
        handler();
      } catch (error) {
        log.warn('[PWA] update handler threw', { error: String(error) });
      }
    }
  };

  const tryShowPrompt = (): void => {
    if (hasPromptedForCurrentVersion()) return;

    if (opts.shouldDefer?.()) {
      const interval = setInterval(() => {
        if (!opts.shouldDefer?.()) {
          clearInterval(interval);
          if (!hasPromptedForCurrentVersion()) {
            markPromptedForCurrentVersion();
            opts.onPrompt();
          }
        }
      }, deferralRetryMs);
      return;
    }

    markPromptedForCurrentVersion();
    opts.onPrompt();
  };

  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      updateSW = opts.registerSW({
        onNeedRefresh() {
          log.info('[PWA] update available', { version: opts.version });
          updateKnownAvailable = true;
          notifyUpdateAvailable();
          tryShowPrompt();
        },
        onOfflineReady() {
          log.info('[PWA] offline ready');
          opts.onOfflineReady?.();
        },
        onRegisteredSW(_swUrl, registration) {
          if (!registration) return;
          activeRegistration = registration;
          opts.onRegistered?.(registration);

          initialCheckTimeoutHandle = setTimeout(() => {
            if (navigator.onLine) {
              registration.update().catch((err: unknown) => {
                log.warn('[PWA] initial update check failed', {
                  error: err instanceof Error ? err.message : String(err),
                });
              });
            }
          }, initialCheckDelayMs);

          pollIntervalHandle = setInterval(() => {
            if (navigator.onLine) {
              registration.update().catch((err: unknown) => {
                log.warn('[PWA] update poll failed', {
                  error: err instanceof Error ? err.message : String(err),
                });
              });
            }
          }, pollIntervalMs);
        },
        onRegisterError(error) {
          log.error('[PWA] registration failed', {
            error: error instanceof Error ? error.message : String(error),
          });
        },
      });
    } catch (error) {
      log.error('[PWA] setup threw', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Note: no controllerchange listener here. workbox-window's updateSW(true)
    // already reloads on controllerchange, and an unconditional listener would
    // also fire on first-install (no prior controller) and stack across resets.
  }

  const applyUpdate = async (): Promise<void> => {
    if (typeof navigator === 'undefined' || !navigator.onLine) {
      log.info('[PWA] update deferred — offline');
      return;
    }
    if (!updateSW) {
      reloadPage();
      return;
    }
    let shouldFallbackReload = false;
    // Fallbacks only apply once onNeedRefresh has proven an update is pending.
    if (updateKnownAvailable && 'serviceWorker' in navigator) {
      const registration =
        activeRegistration ??
        (await navigator.serviceWorker.getRegistration().catch(() => undefined));
      if (!registration?.waiting) {
        log.info('[PWA] known update has already activated; reloading page');
        reloadPage();
        return;
      }
      shouldFallbackReload = true;
    }
    try {
      await updateSW(true);
      if (shouldFallbackReload) {
        scheduleApplyReloadFallback();
      }
    } catch (error) {
      log.warn('[PWA] applyUpdate fallback to reload', {
        error: error instanceof Error ? error.message : String(error),
      });
      reloadPage();
    }
  };

  const checkForUpdate = async (): Promise<boolean> => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
    try {
      const registration =
        activeRegistration ?? (await navigator.serviceWorker.getRegistration());
      if (!registration) return false;
      await registration.update();
      updateKnownAvailable =
        updateKnownAvailable || Boolean(registration.waiting || registration.installing);
      return updateKnownAvailable;
    } catch (error) {
      log.warn('[PWA] manual update check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  };

  const onUpdateAvailable = (handler: () => void): (() => void) => {
    updateAvailableHandlers.add(handler);
    return () => {
      updateAvailableHandlers.delete(handler);
    };
  };

  const __reset = (): void => {
    if (pollIntervalHandle !== undefined) {
      clearInterval(pollIntervalHandle);
      pollIntervalHandle = undefined;
    }
    if (initialCheckTimeoutHandle !== undefined) {
      clearTimeout(initialCheckTimeoutHandle);
      initialCheckTimeoutHandle = undefined;
    }
    if (applyReloadFallbackTimeoutHandle !== undefined) {
      clearTimeout(applyReloadFallbackTimeoutHandle);
      applyReloadFallbackTimeoutHandle = undefined;
    }
    updateSW = undefined;
    activeRegistration = undefined;
    updateKnownAvailable = false;
    updateAvailableHandlers.clear();
    inMemoryPromptedVersions.clear();
  };

  const controller: PwaUpdateController = {
    applyUpdate,
    checkForUpdate,
    onUpdateAvailable,
    __reset,
  };
  activeController = controller;
  return controller;
};
