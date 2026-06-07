/**
 * ShowPresenceProvider — the per-show realtime boundary for one show.
 *
 * Wrapping any per-show surface (Show Details, Workbench, at-show) in this
 * provider does two things: (1) makes the local user a PRODUCER — they broadcast
 * their presence while the surface is open; (2) exposes the privacy-filtered
 * roster to any descendant via useShowPresenceRoster(). One channel per show per
 * tab (plan §7), and the privacy rule (plan §10 #2) is applied here, once.
 *
 * It also hosts the Phase 2 live-update nudge (useShowLiveSync) — a sibling
 * realtime feature that shares this exact lifecycle (mounted at the same three
 * in-show seams). The two features keep INDEPENDENT kill switches (each hook
 * checks its own flag); they are co-located here, not coupled.
 */

import { useMemo, type ReactNode } from 'react';
import { useShowPresence } from './useShowPresence';
import { useLocalPresenceIdentity } from './useLocalPresenceIdentity';
import { filterPresenceForViewer } from './presenceSelectors';
import { ShowPresenceContext } from './showPresenceContext';
import { useShowLiveSync } from '../show-live-sync/useShowLiveSync';

export function ShowPresenceProvider({
  showId,
  children,
}: {
  showId: string | undefined;
  children: ReactNode;
}) {
  // One identity for both roles: the local user PRODUCES with it (useShowPresence)
  // and is filtered as a VIEWER with it (below). Covers a signed-in account AND an
  // anonymous passcode grant — so a passcode-only judge both lights the dot and
  // sees the full roster. Display/privacy role only, never an authz signal.
  const identity = useLocalPresenceIdentity(showId);
  const { present: roster } = useShowPresence(showId, identity);
  const viewerId = identity?.userId;
  const viewerRole = identity?.role ?? 'exhibitor';

  // Phase 2 (docs/plan-show-presence-phase2.md): nudge the incremental
  // replication sync when this show's entries/classes change so in-show surfaces
  // refresh live. Independent kill switch; no-op when its flag is dark.
  useShowLiveSync(showId);

  const value = useMemo(
    () => ({ present: filterPresenceForViewer(roster, viewerId, viewerRole) }),
    [roster, viewerId, viewerRole]
  );

  return <ShowPresenceContext.Provider value={value}>{children}</ShowPresenceContext.Provider>;
}
