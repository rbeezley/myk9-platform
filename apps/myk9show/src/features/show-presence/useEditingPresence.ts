/**
 * useEditingPresence — Phase 3 panel hook (docs/plan-show-presence.md §6).
 *
 * The ONLY thing an edit surface imports to join soft edit-awareness: call it
 * once and it advertises "this user is editing <entityType:entityId>" on mount
 * and clears it on unmount, riding the existing presence channel (no new channel,
 * no DB write). Keep the wiring to one line per panel.
 *
 * No-ops cleanly when: edit-awareness is dark (the producer setters gate on the
 * flag), presence is off, the host is not inside a ShowPresenceProvider (the
 * setters are undefined in context), or the id is not known yet (pass undefined —
 * e.g. while a controlled panel is closed — and the prior advisory is cleared).
 *
 * Assumes ONE edit surface open per tab: the presence payload carries a single
 * `editing` slot, so a second instrumented panel in the same tab overwrites the
 * first. That matches the product reality (one dialog at a time) and the advisory
 * (non-authoritative) nature of the signal.
 */

import { useEffect } from 'react';
import { useShowPresenceRoster } from './showPresenceContext';

export function useEditingPresence(entityType: string, entityId: string | undefined): void {
  const { setEditing, clearEditing } = useShowPresenceRoster();

  useEffect(() => {
    if (!entityId || !setEditing || !clearEditing) return undefined;
    setEditing({ entityType, entityId });
    return () => clearEditing();
  }, [entityType, entityId, setEditing, clearEditing]);
}
