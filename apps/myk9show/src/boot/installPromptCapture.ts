/**
 * Keeps the browser's install offer until something can show it (MYK9-2140).
 *
 * Chromium fires `beforeinstallprompt` once per page load, early. The install banner now loads
 * after the page (the landing page for a guest, the app shell for everyone else), so a listener
 * inside the banner can miss the one event and the banner would stay hidden until the next full
 * page load. `main.tsx` starts this at boot; `usePWAInstall` reads what it kept.
 */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let captured: BeforeInstallPromptEvent | null = null;
let stop: (() => void) | null = null;

/** Start listening. Safe to call more than once; returns a function that stops and forgets. */
export function startInstallPromptCapture(target: Window = window): () => void {
  if (stop) return stop;
  const onPrompt = (event: Event) => {
    // Same as the banner's own listener: hold the browser's mini-infobar, we show the offer.
    event.preventDefault();
    captured = event as BeforeInstallPromptEvent;
  };
  const onInstalled = () => {
    captured = null;
  };
  target.addEventListener('beforeinstallprompt', onPrompt);
  target.addEventListener('appinstalled', onInstalled);
  stop = () => {
    target.removeEventListener('beforeinstallprompt', onPrompt);
    target.removeEventListener('appinstalled', onInstalled);
    captured = null;
    stop = null;
  };
  return stop;
}

/** The install offer the browser made before the banner was listening, if any. */
export function getCapturedInstallPrompt(): BeforeInstallPromptEvent | null {
  return captured;
}

/** The offer was used (a prompt can be shown once), so forget it. */
export function clearCapturedInstallPrompt(): void {
  captured = null;
}
