import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useShowStore } from '@/store/showStore';
import { useDirectoryViewer } from '@/hooks/useDirectoryViewer';
import {
  GUEST_READ_QUERY_OPTIONS,
  resolveGuestRead,
  useQueryOnlineStatus,
} from '@/hooks/guestServerRead';
import {
  getPublicClubShows,
  type ClubShowListItem,
} from '@/services/database/shows/publicClubShows';
import { showDateRangeStatus } from '@/utils/date-format';
import type { Club } from '@/types/club-types';
import type { Show } from '@/types/show-types';
import type { ClubShow, StatCard } from './types';

export type ClubShowsStatus = 'loading' | 'ready' | 'error' | 'offline';

export interface ClubShows {
  upcoming: ClubShow[];
  past: ClubShow[];
  /** Anything but 'ready' must not render as "no shows". */
  status: ClubShowsStatus;
  retry: () => void;
}

export const PUBLIC_CLUB_SHOWS_QUERY_KEY = ['shows', 'public-club'] as const;

const EMPTY: readonly ClubShowListItem[] = [];
const NO_STORE_SHOWS: Show[] = [];

function splitByDate(list: readonly ClubShowListItem[], now: Date) {
  const upcoming: ClubShow[] = [];
  const past: ClubShow[] = [];
  for (const show of list) {
    const clubShow: ClubShow = {
      id: show.id,
      name: show.name,
      date: show.startDate,
      location: show.location,
      description: show.events?.join(', ') || '',
      accentColor: show.accentColor || null,
    };
    if (showDateRangeStatus(show.startDate, show.endDate, now) === 'past') past.push(clubShow);
    else upcoming.push(clubShow);
  }
  return { upcoming, past };
}

/**
 * The shows listed on a club's page. Signed-in viewers read the shows store
 * (the replica, unchanged); guests read the server only.
 */
export function useClubShows(selectedClub: Club | null): ClubShows {
  const clubId = selectedClub?.id;
  const { isGuest, isSignedIn, authLoading, principalKey } = useDirectoryViewer();
  // Only a signed-in viewer reads the replica (see the INTENT below).
  const storeShows = useShowStore(s => (isSignedIn ? s.shows : NO_STORE_SHOWS));
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // INTENT: MYK9-768, same owner decision as MYK9-747 (see useClubDetailData):
  // public, signed-out surfaces read online and never read the shared replica.
  // The shows replica holds whatever an earlier signed-in session on this
  // device could see (a secretary's drafts, shows soft-deleted since), so a
  // guest's list is shows_select's answer for anon, never a cached row, not
  // even offline, and never a cached query result (guestServerRead.ts).
  const guestQuery = useQuery({
    queryKey: [...PUBLIC_CLUB_SHOWS_QUERY_KEY, clubId, principalKey],
    queryFn: () => getPublicClubShows(clubId as string),
    enabled: isGuest && Boolean(clubId),
    ...GUEST_READ_QUERY_OPTIONS,
  });
  const isOnline = useQueryOnlineStatus();
  const guestRead = resolveGuestRead(guestQuery, isOnline);

  const guestShows = guestRead.kind === 'ready' ? guestRead.data : EMPTY;
  const list = useMemo(() => {
    if (!clubId) return EMPTY;
    if (isGuest) return guestShows;
    return storeShows.filter(s => s.clubId === clubId);
  }, [clubId, isGuest, guestShows, storeShows]);
  const { upcoming, past } = useMemo(() => splitByDate(list, now), [list, now]);

  const refetchGuest = guestQuery.refetch;
  const retry = useCallback(() => {
    if (isGuest) void refetchGuest();
  }, [isGuest, refetchGuest]);

  let status: ClubShowsStatus = 'ready';
  if (authLoading) status = 'loading';
  else if (isGuest && clubId && guestRead.kind !== 'ready') status = guestRead.kind;

  return { upcoming, past, status, retry };
}

const UNSETTLED_SHOWS_DETAIL: Record<Exclude<ClubShowsStatus, 'ready'>, string> = {
  loading: 'Loading shows…',
  error: 'Shows unavailable',
  offline: 'Offline',
};

/** The Total Shows card. An unsettled list shows no count, never a false 0. */
export function clubShowsStat({ upcoming, past, status }: ClubShows): StatCard {
  const base = { title: 'Total Shows', type: 'shows' as const, tab: 'upcoming' as const };
  if (status !== 'ready') {
    return { ...base, value: '—', detail1: UNSETTLED_SHOWS_DETAIL[status], detail2: '' };
  }
  const total = upcoming.length + past.length;
  return {
    ...base,
    value: total.toString(),
    detail1: total > 0 ? `Upcoming: ${upcoming.length}` : 'No shows scheduled',
    detail2: total > 0 ? `Completed: ${past.length}` : 'Add your first show',
  };
}
