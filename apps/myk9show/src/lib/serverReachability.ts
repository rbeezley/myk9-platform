/**
 * "Interface up, server unreachable" — the case `navigator.onLine` cannot see
 * (captive portal, venue hotspot with a dead uplink). MYK9-864.
 *
 * Probe-on-failure: nothing runs while writes succeed. A write that fails at the
 * transport level marks the server unreachable; a probe then retries until Supabase
 * answers, and the flag clears. No background traffic in the normal case.
 */
import { useSyncExternalStore } from 'react';

export const REACHABILITY_PROBE_INTERVAL_MS = 15_000;
const PROBE_TIMEOUT_MS = 5_000;

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
 * interception, dropped connection) as `status: 0` with an empty error code.
 * Anything with an HTTP status — RLS, auth, 5xx — reached the server and is not
 * a connectivity problem.
 */
export function isTransportFailure(result: { status?: number | null }): boolean {
  return result.status === 0;
}

/**
 * Any HTTP response, even 401/404, proves the server is reachable. `no-cors` keeps
 * a CORS rejection from reading as "unreachable": only a network failure rejects.
 */
async function probeServer(): Promise<boolean> {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!baseUrl) return true;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    await fetch(`${baseUrl}/auth/v1/health`, {
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function scheduleProbe(delayMs: number) {
  if (probeTimer !== null) clearTimeout(probeTimer);
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
  } else if (!reachable) {
    scheduleProbe(REACHABILITY_PROBE_INTERVAL_MS);
  }
}

function handleBrowserOnline() {
  if (!reachable) scheduleProbe(0);
}

export function markServerUnreachable(): void {
  if (!reachable) return;
  setReachable(false);
  scheduleProbe(REACHABILITY_PROBE_INTERVAL_MS);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1 && typeof window !== 'undefined') {
    window.addEventListener('online', handleBrowserOnline);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== 'undefined') {
      window.removeEventListener('online', handleBrowserOnline);
    }
  };
}

const getSnapshot = () => reachable;

export function useServerReachable(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function resetServerReachabilityForTests(): void {
  if (probeTimer !== null) clearTimeout(probeTimer);
  probeTimer = null;
  probeInFlight = false;
  reachable = true;
  listeners.forEach(listener => listener());
}
