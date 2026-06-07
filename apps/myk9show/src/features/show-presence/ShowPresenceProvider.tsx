/**
 * ShowPresenceProvider — owns the single presence channel for one show.
 *
 * Wrapping any per-show surface (Show Details, Workbench, at-show) in this
 * provider does two things: (1) makes the local user a PRODUCER — they broadcast
 * their presence while the surface is open; (2) exposes the privacy-filtered
 * roster to any descendant via useShowPresenceRoster(). One channel per show per
 * tab (plan §7), and the privacy rule (plan §10 #2) is applied here, once.
 */

import { useMemo, type ReactNode } from 'react';
import { useShowPresence } from './useShowPresence';
import { useLocalPresenceIdentity } from './useLocalPresenceIdentity';
import { filterPresenceForViewer } from './presenceSelectors';
import { ShowPresenceContext } from './showPresenceContext';

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

  const value = useMemo(
    () => ({ present: filterPresenceForViewer(roster, viewerId, viewerRole) }),
    [roster, viewerId, viewerRole]
  );

  return <ShowPresenceContext.Provider value={value}>{children}</ShowPresenceContext.Provider>;
}
