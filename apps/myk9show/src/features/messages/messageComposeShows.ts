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
 * So the list is the club-scoped `selectMessageShows` set — never the raw show
 * store, which also holds every show loaded for public browsing — plus, for a
 * judge, the shows in their current context (the announcement subscription:
 * the show selected in Mission Control and today's shows). The client has no
 * judge-assignment set to scope that arm further; the server's judge arm is the
 * boundary there, as it was before this change.
 */
export function selectComposeShows(
  shows: readonly ComposeShowSource[] | null | undefined,
  contextShowIds: readonly string[],
  userWithRoles: UserWithRoles | null | undefined,
  hasRole: (role: UserRole) => boolean
): ComposeShowOption[] {
  const options: ComposeShowOption[] = selectMessageShows(shows, userWithRoles, hasRole).map(
    show => ({ id: show.id, name: show.name })
  );
  if (!hasRole(UserRole.JUDGE)) return options;

  const namesById = new Map((shows ?? []).map(show => [show.id, show.name]));
  const offered = new Set(options.map(option => option.id));
  contextShowIds.forEach((showId, index) => {
    if (offered.has(showId)) return;
    offered.add(showId);
    options.push({
      id: showId,
      name:
        namesById.get(showId) ??
        (contextShowIds.length === 1 ? 'Current show' : `Show ${index + 1}`),
    });
  });
  return options;
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
