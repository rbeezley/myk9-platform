import { format, parseISO } from 'date-fns';
import { UserRole, type UserWithRoles } from '@/types/auth-types';
import type { JudgedShow } from '@/services/database/judges';
import { selectMessageShows, type MessageShowScope } from './messageShowScope';

/**
 * Why the person may post to a show, which also decides the lanes they get:
 * `manage` keeps the composer's role-based lanes; `judge` is show-wide
 * announcements only (the judge arm of the `show_announcements` INSERT policy).
 */
export type ComposeShowLane = 'manage' | 'judge';

export interface ComposeShowOption {
  id: string;
  name: string;
  lane: ComposeShowLane;
}

interface ComposeShowSource extends MessageShowScope {
  name: string;
}

export interface SelectComposeShowsInput {
  shows: readonly ComposeShowSource[] | null | undefined;
  userWithRoles: UserWithRoles | null | undefined;
  hasRole: (role: UserRole) => boolean;
  judgedShows: readonly JudgedShow[];
}

/**
 * The one show-scoping rule for the Message Center composer (MYK9-641, MYK9-722).
 * It mirrors who the server lets post:
 *
 * - `show_messages` / `show_message_threads` / `show_announcements` club arm:
 *   the show's own club secretary or club admin; a site admin anywhere. That is
 *   `selectMessageShows`, the same scope Communication History uses, applied to
 *   the replicated show store.
 * - `show_announcements` judge arm (20260917163900): a confirmed or invited
 *   assignment at the show. `judgedShows` comes from the replicated assignments,
 *   so a future show missing from the show store is still offered.
 *
 * Nothing falls back to the announcement subscription or the raw show store:
 * both hold shows the person only exhibits at or browsed.
 */
export function selectComposeShows({
  shows,
  userWithRoles,
  hasRole,
  judgedShows,
}: SelectComposeShowsInput): ComposeShowOption[] {
  const managed: ComposeShowOption[] = selectMessageShows(shows, userWithRoles, hasRole).map(
    show => ({ id: show.id, name: show.name, lane: 'manage' })
  );
  const managedIds = new Set(managed.map(show => show.id));
  const namesById = new Map((shows ?? []).map(show => [show.id, show.name]));
  const judged: ComposeShowOption[] = judgedShows
    .filter(show => !managedIds.has(show.showId))
    .map(show => ({
      id: show.showId,
      name: namesById.get(show.showId) ?? judgedShowFallbackName(show.firstTrialDate),
      lane: 'judge',
    }));
  return [...managed, ...judged];
}

/** A judged show that is not in the local show store yet (e.g. a future one). */
function judgedShowFallbackName(firstTrialDate: string | null): string {
  if (!firstTrialDate) return 'Show you are judging';
  try {
    return `Show you are judging, ${format(parseISO(firstTrialDate), 'MMM d, yyyy')}`;
  } catch {
    return 'Show you are judging';
  }
}

const ROUTE_SHOW_PATTERNS = [
  /^\/(?:secretary\/)?shows\/([^/]+)/,
  /^\/secretary\/(?:messages|entries|register)\/([^/]+)/,
  /^\/at-show\/([^/]+)/,
  /^\/messages\/([^/]+)/,
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

export interface ComposeShowSelection {
  selected: ComposeShowOption | undefined;
  /** Opened from this show's page: the composer is fixed to it. */
  locked: boolean;
}

/**
 * The show the composer posts to: the page it was opened from when the person
 * may post there (locked), else the one they picked, else the only option.
 */
export function resolveComposeShow(
  options: readonly ComposeShowOption[],
  routeShowId: string,
  pickedShowId: string
): ComposeShowSelection {
  const fromRoute = routeShowId ? options.find(option => option.id === routeShowId) : undefined;
  if (fromRoute) return { selected: fromRoute, locked: true };
  const picked = pickedShowId ? options.find(option => option.id === pickedShowId) : undefined;
  return { selected: picked ?? (options.length === 1 ? options[0] : undefined), locked: false };
}
