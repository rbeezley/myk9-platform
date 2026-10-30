/**
 * "Refresh app" (MYK9-1549): an installed PWA has no browser reload button.
 * Reloads the page; when a service worker is already waiting, activates it
 * first (the SKIP_WAITING contract in `installSkipWaitingHandler`) and reloads
 * once it takes control, so the reload lands on the new build.
 */

const CONTROLLER_CHANGE_FALLBACK_MS = 3000;

export async function refreshApp(reload: () => void = () => window.location.reload()) {
  const registration =
    typeof navigator !== 'undefined' && 'serviceWorker' in navigator
      ? await navigator.serviceWorker.getRegistration().catch(() => undefined)
      : undefined;
  const waiting = registration?.waiting;
  if (!waiting) {
    reload();
    return;
  }
  let reloaded = false;
  const reloadOnce = () => {
    if (reloaded) return;
    reloaded = true;
    reload();
  };
  navigator.serviceWorker.addEventListener('controllerchange', reloadOnce, { once: true });
  // If the swap never signals (already activating), reload anyway.
  setTimeout(reloadOnce, CONTROLLER_CHANGE_FALLBACK_MS);
  waiting.postMessage({ type: 'SKIP_WAITING' });
}
