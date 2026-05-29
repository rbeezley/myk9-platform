/**
 * Phase 1a — client-side feature flag gating the unified ringside `/at-show`
 * mount in myK9Show.
 *
 * OFF by default. There is intentionally NO `shows.unified_ringside_enabled`
 * DB column yet — that owner-gated migration is Phase 1e. Until then this is a
 * pure client flag, flipped via the `VITE_UNIFIED_RINGSIDE_ENABLED` env var for
 * local smoke-testing (`VITE_UNIFIED_RINGSIDE_ENABLED=true pnpm dev:show`).
 *
 * When this returns false, `AtShowRoutes()` registers nothing, so
 * `/at-show/...` falls through to the app's 404 catch-all.
 */
export function isUnifiedRingsideEnabled(): boolean {
  return import.meta.env.VITE_UNIFIED_RINGSIDE_ENABLED === 'true';
}
