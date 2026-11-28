import type { ClubAccessRequest } from '@/services/database/club-access-requests';

/** The slice of a club the waiting list needs. */
export interface WaitingClub {
  id: string;
  name: string;
  createdAt?: string | undefined;
}

/**
 * One row of the Onboarding list: a club waiting for approval, with the pending
 * request that asked for it when there is one. A club made by hand has no request.
 */
export interface WaitingClubRow {
  key: string;
  /** Null only for a legacy request whose club was never created. */
  clubId: string | null;
  name: string;
  request: ClubAccessRequest | null;
  createdAt: string | null;
}

/**
 * MYK9-2527: one list, one row per club. The unauthorized clubs are the spine; each is
 * joined to its pending request (by `created_club_id`) so a club the requester just made
 * appears once, not once as a request and again as an unauthorized club. A pending request
 * whose club was never created still gets its own row, so no request is dropped.
 *
 * `clubsOnly` (the notification deep link, `?creator=`) shows only the clubs the server
 * returned for that creator, with their requests.
 */
export function buildWaitingClubRows(
  clubs: readonly WaitingClub[],
  requests: readonly ClubAccessRequest[],
  clubsOnly = false
): WaitingClubRow[] {
  const pending = requests.filter(request => request.status === 'pending');
  const requestByClub = new Map<string, ClubAccessRequest>();
  for (const request of pending) {
    if (request.createdClubId && !requestByClub.has(request.createdClubId)) {
      requestByClub.set(request.createdClubId, request);
    }
  }

  const rows: WaitingClubRow[] = clubs.map(club => {
    const request = requestByClub.get(club.id) ?? null;
    return {
      key: club.id,
      clubId: club.id,
      name: club.name,
      request,
      createdAt: request?.createdAt ?? club.createdAt ?? null,
    };
  });

  if (!clubsOnly) {
    const listed = new Set(clubs.map(club => club.id));
    for (const request of pending) {
      if (request.createdClubId && listed.has(request.createdClubId)) continue;
      // A pending request for a club that is not (or no longer) in the awaiting list.
      rows.push({
        key: `request-${request.id}`,
        clubId: request.createdClubId,
        name: request.requestedClubName,
        request,
        createdAt: request.createdAt,
      });
    }
  }

  // A work queue: the club waiting longest first. A row with no date sorts last.
  return rows.sort((a, b) => {
    const left = a.createdAt ? Date.parse(a.createdAt) : Number.POSITIVE_INFINITY;
    const right = b.createdAt ? Date.parse(b.createdAt) : Number.POSITIVE_INFINITY;
    return left - right;
  });
}
