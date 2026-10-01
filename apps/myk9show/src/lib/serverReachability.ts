/**
 * "Interface up, server unreachable" — the case `navigator.onLine` cannot see
 * (captive portal, venue hotspot with a dead uplink). MYK9-864.
 *
 * Probe-on-failure: nothing runs while writes succeed. A write that fails at the
 * transport level marks the server unreachable; a probe then retries until Supabase
 * answers, and the flag clears. No background traffic in the normal case.
 */
import { useSyncExternalStore } from 'react';

/** Short first retry so one dropped request does not lock the controls for long. */
export const REACHABILITY_FIRST_PROBE_MS = 2_000;
export const REACHABILITY_PROBE_INTERVAL_MS = 15_000;
const PROBE_TIMEOUT_MS = 10_000;

let reachable = true;
let probeTimer: ReturnType<typeof setTimeout> | null = null;
let probeInFlight = false;
const listeners = new Set<() => void>();

function setReachable(next: boolean) {
  if (reachable === next) return;
  reachable = next;
  listeners.forEach(listener => listener());
}

/**
 * postgrest-js resolves a request whose fetch rejected (DNS failure, TLS
 * interception, dropped connection, our own timeout abort) as `status: 0`.
 * Anything with an HTTP status — RLS, auth, 5xx — reached the server.
 */
export function isTransportFailure(result: { status?: number | null }): boolean {
  return result.status === 0;
}

/**
 * Any HTTP response, even 401/404, proves the server is reachable. `no-cors` keeps
 * a CORS rejection from reading as "unreachable": only a network failure rejects.
 * The CSP `connect-src` must allow this host (it allows https://*.supabase.co).
 */
/** `AbortSignal.timeout` arrived in Safari 16; the build still targets Safari 14.1. */
export function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(new DOMException('signal timed out', 'TimeoutError')), ms);
  return controller.signal;
}

async function probeServer(): Promise<boolean> {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!baseUrl) return true;
  try {
    await fetch(`${baseUrl}/auth/v1/health`, {
      mode: 'no-cors',
      cache: 'no-store',
      signal: timeoutSignal(PROBE_TIMEOUT_MS),
    });
    return true;
  } catch {
    return false;
  }
}

function clearProbe() {
  if (probeTimer !== null) clearTimeout(probeTimer);
  probeTimer = null;
}

/**
 * Probe only while someone is showing the hint and the device has a network: with
 * no listeners nothing needs the answer (the next subscribe restarts it), and while
 * offline the browser's `online` event restarts it.
 */
function scheduleProbe(delayMs: number) {
  clearProbe();
  if (reachable || listeners.size === 0) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  probeTimer = setTimeout(() => {
    probeTimer = null;
    void runProbe();
  }, delayMs);
}

async function runProbe() {
  if (probeInFlight || reachable) return;
  probeInFlight = true;
  const ok = await probeServer();
  probeInFlight = false;
  if (ok) {
    setReachable(true);
  } else {
    scheduleProbe(REACHABILITY_PROBE_INTERVAL_MS);
  }
}

function probeSoon() {
  if (reachable || probeInFlight) return;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  scheduleProbe(0);
}

export function markServerUnreachable(): void {
  if (!reachable) return;
  setReachable(false);
  scheduleProbe(REACHABILITY_FIRST_PROBE_MS);
}

/**
 * The one place a failed Supabase request (read or write) feeds the flag: only a
 * transport-level failure counts. RLS, auth and 5xx errors reached the server.
 */
export function markUnreachableIfTransportFailure(result: {
  error?: unknown;
  status?: number | null;
}): void {
  if (result.error && isTransportFailure(result)) markServerUnreachable();
}

const WINDOW_WAKE_EVENTS = ['online', 'focus'] as const;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1 && typeof window !== 'undefined') {
    WINDOW_WAKE_EVENTS.forEach(event => window.addEventListener(event, probeSoon));
    document.addEventListener('visibilitychange', probeSoon);
    if (!reachable && probeTimer === null) scheduleProbe(REACHABILITY_FIRST_PROBE_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== 'undefined') {
      WINDOW_WAKE_EVENTS.forEach(event => window.removeEventListener(event, probeSoon));
      document.removeEventListener('visibilitychange', probeSoon);
      clearProbe();
    }
  };
}

const getSnapshot = () => reachable;

export function useServerReachable(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function resetServerReachabilityForTests(): void {
  clearProbe();
  probeInFlight = false;
  reachable = true;
  listeners.forEach(listener => listener());
}
