/**
 * Phase 1d — unified ringside `/at-show` enablement.
 *
 * Source of truth is the per-show DB column `shows.unified_ringside_enabled`
 * (Phase 1e migration `20260529120000`, live). A show with the column `true`
 * exposes its `/at-show` ringside surface; everything else falls back to the
 * inline "not enabled" notice rendered by `UnifiedRingsideGate`.
 *
 * `VITE_UNIFIED_RINGSIDE_ENABLED=true` remains a **DEV-only** escape hatch that
 * force-enables ringside locally (`VITE_UNIFIED_RINGSIDE_ENABLED=true pnpm
 * dev:show`) without flipping a DB row. It is ignored outside `import.meta.env.DEV`
 * so a stray prod env var can never silently enable the surface.
 *
 * The flag is resolved per-show and asynchronously (the column arrives via the
 * offline-first replication layer), so the gate lives in `UnifiedRingsideGate`
 * inside each route element — NOT as a global guard at route-registration time.
 */

/**
 * Dev-only force-enable. True only when running a dev build with the env var
 * explicitly set to `'true'`. Always false in production builds.
 */
export function isUnifiedRingsideDevOverride(): boolean {
  return import.meta.env.DEV && import.meta.env.VITE_UNIFIED_RINGSIDE_ENABLED === 'true';
}

/**
 * Pure resolver for whether unified ringside is enabled for a show. Kept pure
 * (no env / no async) so the branch logic is unit-testable in isolation.
 *
 * @param devOverride  result of {@link isUnifiedRingsideDevOverride}
 * @param showEnabled  `shows.unified_ringside_enabled` for the current show
 *                     (`undefined` when the show is missing / not yet loaded)
 */
export function resolveUnifiedRingsideEnabled({
  devOverride,
  showEnabled,
}: {
  devOverride: boolean;
  showEnabled: boolean | undefined;
}): boolean {
  return devOverride || showEnabled === true;
}
