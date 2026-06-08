/**
 * Kill switch for Phase 4 conflict surfacing (docs/plan-show-presence.md §6/§12).
 *
 * OFF by default — ships dark until:
 *  1. The `replication:conflict` event rate looks sane in the field (§7 observability).
 *  2. The <ConflictBanner> reconcile UX is live-validated with two-browser same-field edits.
 *
 * When ON, same-field collisions at the syncReplicatedTable chokepoint surface as
 * `replication:conflict` window events instead of silently resolving last-write-wins.
 * Covers ALL replicated tables automatically — no per-surface code required.
 *
 * Rollback = flip `features.showConflictSurfacing` back to `false`; the existing
 * field-merge/LWW sync path is byte-for-byte unchanged when this returns false.
 *
 * Env override (VITE_SHOW_CONFLICT_SURFACING=true) forces it on for E2E / manual smoke.
 */

import { features } from '@/config/features';

export function showConflictSurfacingEnabled(): boolean {
  if (import.meta.env?.VITE_SHOW_CONFLICT_SURFACING === 'false') return false;
  return (
    features.showConflictSurfacing || import.meta.env?.VITE_SHOW_CONFLICT_SURFACING === 'true'
  );
}
