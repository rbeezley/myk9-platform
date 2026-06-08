/**
 * Kill switch for Phase 3 soft edit-awareness (docs/plan-show-presence.md §6/§12).
 *
 * INDEPENDENT of `features.showPresence` (which is already live): edit-awareness
 * dark-launches behind its own flag so it ships un-broadcast until validated live
 * with two browsers — the same "land dark → validate → flip" discipline that
 * caught three real Realtime bugs in Phases 1–2. Reusing the (already-ON)
 * presence flag would ship edit-awareness immediately and un-validated.
 *
 * It gates BOTH ends, so when dark there is nothing to see and nothing on the
 * wire: the producer (`setEditing`/`clearEditing` in useShowPresence) broadcasts
 * no `editing` slot, and the consumer (EditingBadge) renders nothing.
 *
 * Evaluated at call time (not module load) so tests can flip the flag. Env
 * override (VITE_SHOW_EDIT_AWARENESS=true) forces it on for E2E / manual smoke
 * without editing the const.
 */

import { features } from '@/config/features';

export function showEditAwarenessEnabled(): boolean {
  return features.showEditAwareness || import.meta.env?.VITE_SHOW_EDIT_AWARENESS === 'true';
}
