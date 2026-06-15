/**
 * Kill switch for Phase 4 conflict surfacing (docs/plan-show-presence.md §6/§12).
 *
 * ON by default — enabled after smoke-testing 2026-06-08 (toast + both
 * keep-mine/take-theirs resolution paths confirmed in a live browser smoke test).
 *
 * When ON, same-field collisions at the syncReplicatedTable chokepoint surface as
 * `replication:conflict` window events instead of silently resolving last-write-wins.
 * Covers ALL replicated tables automatically — no per-surface code required.
 *
 * Rollback = flip `features.showConflictSurfacing` back to `false` (or set
 * VITE_SHOW_CONFLICT_SURFACING=false to force off without a redeploy); the existing
 * field-merge/LWW sync path is byte-for-byte unchanged when this returns false.
 *
 * Env override: VITE_SHOW_CONFLICT_SURFACING=false forces it off; =true forces it on
 * (for E2E / manual smoke) even if the flag were disabled.
 */

import { features } from '@/config/features';

export function showConflictSurfacingEnabled(): boolean {
  if (import.meta.env?.VITE_SHOW_CONFLICT_SURFACING === 'false') return false;
  return (
    features.showConflictSurfacing || import.meta.env?.VITE_SHOW_CONFLICT_SURFACING === 'true'
  );
}
