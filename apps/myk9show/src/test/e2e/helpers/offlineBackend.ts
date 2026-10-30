import type { BrowserContext } from '@playwright/test';

/**
 * Derived from the CONFIGURED Supabase URL, not hard-coded to `*.supabase.co`.
 * The isolated/local E2E target runs Supabase at `http://127.0.0.1:54321`, which
 * a cloud-only glob matches zero times — `goOffline` would then be a silent
 * no-op and the "offline" assertions would run against a live backend.
 */
export function supabaseRouteGlob(): string {
  const configured = process.env.VITE_SUPABASE_URL;
  if (!configured) return '**/*.supabase.co/**';
  try {
    return `${new URL(configured).origin}/**`;
  } catch {
    return '**/*.supabase.co/**';
  }
}

/**
 * Cut the backend off in a way that outlives a reload.
 *
 * Returns a count of intercepted requests. The caller asserts it is non-zero:
 * without that, a glob matching nothing would leave the app happily online and
 * every assertion below would still pass, turning this into a test that proves
 * the opposite of what it claims.
 */
export async function goOffline(context: BrowserContext): Promise<() => number> {
  let intercepted = 0;
  await context.route(supabaseRouteGlob(), route => {
    intercepted += 1;
    return route.abort('internetdisconnected');
  });
  return () => intercepted;
}

/**
 * Report `navigator.onLine === false` for the whole context, across reloads.
 *
 * This is the app-facing half of "no signal": the offline banners, the network
 * status provider, and anything else reading `navigator.onLine` see a device
 * with no connectivity, not one on a captive venue Wi-Fi.
 *
 * It does NOT put TanStack Query into its paused state, and that surprised the
 * fix that added this test. `onlineManager` (query-core 5.x) initialises
 * `#online = true` unconditionally and only ever changes on a window
 * `online`/`offline` EVENT — it never reads `navigator.onLine`. A page that
 * BOOTS with no connectivity gets no such event, so every query fires, fails,
 * and lands in `status:'error'`. The paused shape needs a connectivity
 * transition while the page is already open, which a cold boot by definition
 * does not have. See the exhibitor test below for what that means for coverage.
 */
export async function reportOffline(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    Object.defineProperty(window.navigator, 'onLine', { get: () => false, configurable: true });
  });
}
