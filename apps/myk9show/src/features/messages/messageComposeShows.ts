import { UserRole, type UserWithRoles } from '@/types/auth-types';
import { selectMessageShows, type MessageShowScope } from './messageShowScope';

export interface ComposeShowOption {
  id: string;
  name: string;
}

interface ComposeShowSource extends MessageShowScope {
  name: string;
}

/**
 * The shows the Message Center composer may offer (MYK9-641, walk F47).
 *
 * The server decides who may post, on both lanes:
 *
 * - `show_messages` / `show_message_threads` INSERT: platform admin, or the
 *   show's own club secretary / club admin.
 * - `show_announcements` INSERT (20260917163900, MYK9-636): the same club arm,
 *   plus a judge assigned to the show.
 *
 * A secretary, club admin or site admin gets the club-scoped
 * `selectMessageShows` set — never the raw show store, which also holds every
 * show loaded for public browsing.
 *
 * Every other role, judges included, keeps the list the composer has always
 * built: the announcement subscription's shows (the show selected in Mission
 * Control and today's shows), else the whole show store. The client holds no
 * judge-assignment set to scope the judge arm with, so narrowing it here would
 * only take away shows a judge can post to; the server's judge arm stays the
 * boundary. Judge scoping is tracked separately.
 */
export function selectComposeShows(
  shows: readonly ComposeShowSource[] | null | undefined,
  contextShowIds: readonly string[],
  userWithRoles: UserWithRoles | null | undefined,
  hasRole: (role: UserRole) => boolean
): ComposeShowOption[] {
  const isScopedStaff =
    hasRole(UserRole.SECRETARY) || hasRole(UserRole.CLUB_ADMIN) || hasRole(UserRole.SITE_ADMIN);
  if (isScopedStaff) {
    return selectMessageShows(shows, userWithRoles, hasRole).map(show => ({
      id: show.id,
      name: show.name,
    }));
  }
  return selectContextShows(shows ?? [], contextShowIds);
}

/** The composer's list before MYK9-641, kept for roles it does not scope. */
function selectContextShows(
  shows: readonly ComposeShowSource[],
  contextShowIds: readonly string[]
): ComposeShowOption[] {
  if (contextShowIds.length === 0) return shows.map(show => ({ id: show.id, name: show.name }));
  const namesById = new Map(shows.map(show => [show.id, show.name]));
  return contextShowIds.map((showId, index) => ({
    id: showId,
    name:
      namesById.get(showId) ?? (contextShowIds.length === 1 ? 'Current show' : `Show ${index + 1}`),
  }));
}

const ROUTE_SHOW_PATTERNS = [
  /^\/(?:secretary\/)?shows\/([^/]+)/,
  /^\/secretary\/(?:messages|entries|register)\/([^/]+)/,
  /^\/at-show\/([^/]+)/,
];

/** The show a route is about: `?showId=` first, then the path's show segment. */
export function readRouteShowId(pathname: string, search: string): string {
  const fromQuery = new URLSearchParams(search).get('showId');
  if (fromQuery) return fromQuery;
  for (const pattern of ROUTE_SHOW_PATTERNS) {
    const match = pathname.match(pattern)?.[1];
    if (match) return safeDecode(match);
  }
  return '';
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * The show the composer opens on: the one the person is standing on when it is
 * one they may post to, else the only option, else none (they pick).
 */
export function initialComposeShowId(
  options: readonly ComposeShowOption[],
  routeShowId: string
): string {
  if (routeShowId && options.some(option => option.id === routeShowId)) return routeShowId;
  return options.length === 1 ? options[0].id : '';
}
