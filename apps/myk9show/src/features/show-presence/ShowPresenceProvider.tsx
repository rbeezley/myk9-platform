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
import { useAuthContext } from '@/hooks/useAuthContext';
import { useShowPresence } from './useShowPresence';
import { filterPresenceForViewer } from './presenceSelectors';
import { ShowPresenceContext } from './showPresenceContext';

export function ShowPresenceProvider({
  showId,
  children,
}: {
  showId: string | undefined;
  children: ReactNode;
}) {
  const { present: roster } = useShowPresence(showId);
  const { user, getUserRoles } = useAuthContext();
  const viewerId = user?.id;
  // Display/privacy role only (never an authz signal); default to least-privilege.
  const viewerRole = getUserRoles?.()?.[0] ?? 'exhibitor';

  const value = useMemo(
    () => ({ present: filterPresenceForViewer(roster, viewerId, viewerRole) }),
    [roster, viewerId, viewerRole]
  );

  return <ShowPresenceContext.Provider value={value}>{children}</ShowPresenceContext.Provider>;
}
