import {
  buildExhibitorRegistrationPath,
  buildSecretaryRegistrationPath,
} from '@/pages/RegistrationWizardPage.routes';
import { SHOW_SHELL_CHILD_SEGMENTS } from '@/routes/showManagementSections';
import { TRIAL_SECRETARY_ONLY_REASON } from './trialSecretaryAccess';

/**
 * THE registry of "what can I do from here" (MYK9-630).
 *
 * One ordered list per route context, resolved by a pure function so the app
 * header's Actions menu and the command palette read the SAME list and can
 * never disagree (Richard, 2026-09-17: "one place to go... always visible... if
 * an option is not relevant it would be grayed out").
 *
 * Two rules the shape encodes:
 * - An item that BELONGS to this context but is unavailable is returned with a
 *   one-line `disabledReason`. An item that does not belong is simply absent --
 *   never a grey row the viewer could never use.
 * - Every item is a LINK into the canonical surface, never a second
 *   implementation of it (CLAUDE.md, consolidate don't duplicate).
 */
/**
 * A named side effect the registry cannot perform itself, because it needs
 * React state the pure resolver has no access to. `useCurrentActions` binds
 * each one to a real callback; nothing else may invent a command.
 */
export type ActionCommand = 'publish-premium';

export interface AppAction {
  id: string;
  label: string;
  /**
   * Where this action lives, for the items that ARE a destination. A
   * search-only value (`?edit=true`) is deliberate and resolves against the
   * viewer's current path, so the action happens where they are standing.
   */
  href?: string;
  /**
   * Set instead of `href` when the action is a side effect rather than a
   * place. A hash link is NOT an acceptable stand-in: the router pushes a hash
   * without fragment navigation, so nothing scrolls and `:target` never
   * matches (MYK9-630 round 3 review).
   */
  command?: ActionCommand;
  /** Bound by `useCurrentActions` for `command` items; absent in the pure layer. */
  run?: () => void;
  /** Present when the item belongs here but the viewer cannot use it. */
  disabledReason?: string;
  /** Renders a divider above this item. */
  separatorBefore?: boolean;
  destructive?: boolean;
}

export type ActionRouteContext =
  | {
      kind: 'show';
      showId: string;
      /**
       * Whether `ShowManagementShell` — the only thing that consumes
       * `?edit=true` — is mounted at this path. False on the show's SIBLING
       * routes (`/register`, `/trials/...`), which are not nested under
       * `/shows/:id` and so render no shell at all.
       */
      shellMounted: boolean;
    }
  | { kind: 'global' };

export interface ActionViewer {
  /** May manage THIS show -- the same gate the management routes use. */
  canManageShow: boolean;
  /**
   * Holds the operational trial-secretary (or site-admin) role over this show.
   * Strictly narrower than `canManageShow`: a club admin manages the show's
   * lifecycle, but `/secretary/register/:showId` is gated on SECRETARY /
   * SITE_ADMIN (`routes/secretaryRoutes.tsx`), so mail-in entry is not theirs.
   */
  canOperateShow: boolean;
  canCreateShows: boolean;
  /** Holds a show-management staff role anywhere (drives the role-wide list). */
  isShowManagementStaff: boolean;
}

const SHOW_PATH = /^\/shows\/([^/]+)(?:\/|$)/;
const SECRETARY_REGISTER_PATH = /^\/secretary\/register\/([^/]+)(?:\/|$)/;

/**
 * Segments that sit where a show id sits but name no show. `/shows/new` and
 * `/shows/browse` are both real routes (`publicRoutes.tsx` redirects them into
 * the create-show wizard and the browse list), so without this they parsed as
 * `{ kind: 'show', showId: 'new' | 'browse' }` and the header offered six
 * actions against a show that does not exist.
 *
 * Exported so `actionRegistry.routeSegments.test.ts` can check this list
 * against the REAL route tree and fail loudly when a new literal is added --
 * importing the route tree here would make the resolver anything but pure.
 */
export const NON_SHOW_ID_SEGMENTS = new Set(['new', 'browse']);

/**
 * The child segments of `/shows/:id`, i.e. the paths where
 * `ShowManagementShell` is mounted and can honour a `?edit=true` the viewer
 * arrives with. Read straight off the route model, so the six tabs, their
 * legacy redirect paths and `classes/:trialId[/create]` are all covered and a
 * seventh tab cannot be added to one list and not the other.
 *
 * Fail CLOSED: anything not listed is treated as shell-less and gets the
 * absolute link, which always works. `actionRegistry.routeSegments.test.tsx`
 * checks both halves against the real `PublicRoutes()` tree.
 */
export const SHELL_MOUNTED_CHILD_SEGMENTS = new Set<string>(SHOW_SHELL_CHILD_SEGMENTS);

const SHOW_CHILD_PATH = /^\/shows\/[^/]+(?:\/([^/]+))?/;

/**
 * Is the show management shell mounted at this path? `/shows/:id` itself and
 * its nested children yes; its siblings no.
 */
export function isShowShellMountedPath(pathname: string): boolean {
  const match = SHOW_CHILD_PATH.exec(pathname);
  if (!match) return false;
  const child = match[1];
  if (child === undefined || child === '') return true;
  return SHELL_MOUNTED_CHILD_SEGMENTS.has(child);
}

/**
 * The route context a pathname puts the viewer in. Pure, so both doors (header
 * menu and command palette) derive it identically and it is unit-testable
 * without a router.
 */
export function parseActionRouteContext(pathname: string): ActionRouteContext {
  for (const pattern of [SHOW_PATH, SECRETARY_REGISTER_PATH]) {
    const match = pattern.exec(pathname);
    const raw = match?.[1];
    if (!raw) continue;
    const showId = decodeURIComponent(raw);
    if (NON_SHOW_ID_SEGMENTS.has(showId)) return { kind: 'global' };
    return { kind: 'show', showId, shellMounted: isShowShellMountedPath(pathname) };
  }
  return { kind: 'global' };
}

function buildShowActions(
  showId: string,
  shellMounted: boolean,
  viewer: ActionViewer
): AppAction[] {
  if (!viewer.canManageShow) return [];

  const encoded = encodeURIComponent(showId);
  const mailInEntry: AppAction = {
    id: 'show-add-mail-in-entry',
    label: 'Add mail-in entry',
    href: buildSecretaryRegistrationPath(showId),
    ...(viewer.canOperateShow ? {} : { disabledReason: TRIAL_SECRETARY_ONLY_REASON }),
  };

  return [
    mailInEntry,
    {
      id: 'show-enter-own-dogs',
      label: 'Enter my own dogs',
      href: buildExhibitorRegistrationPath(showId),
    },
    {
      id: 'show-open-entry-management',
      label: 'Open Entries',
      href: `/shows/${encoded}/entries`,
    },
    {
      id: 'show-open-show-desk',
      label: 'Open Show Day',
      href: `/shows/${encoded}/show-day`,
    },
    {
      // Runs the Premium List card's OWN flow, from whatever section the
      // secretary is on. It was a link to the card's anchor, which the router
      // could not honour: a pushed hash is not fragment navigation, so at
      // 375px nothing scrolled at all and from another section the card
      // arrived unhighlighted.
      id: 'show-generate-publish-premium',
      label: 'Generate & publish premium',
      command: 'publish-premium',
      separatorBefore: true,
    },
    {
      // SEARCH-ONLY where the shell is mounted, so the panel opens on the
      // section the secretary is already on: an absolute `/shows/:id?edit=true`
      // walked them off Entry Management to Overview and stranded them there
      // when they closed it, which the deleted `...` menu never did.
      //
      // On a SIBLING route (`/register`, `/trials/...`) no shell is mounted, so
      // a relative param would sit in the URL with nothing to consume it. There
      // the item goes to Overview, where the panel actually lives.
      id: 'show-settings',
      label: 'Show settings…',
      href: shellMounted ? '?edit=true' : `/shows/${encoded}?edit=true`,
    },
  ];
}

function buildRoleWideActions(viewer: ActionViewer): AppAction[] {
  const actions: AppAction[] = [];
  if (viewer.canCreateShows) {
    actions.push({ id: 'create-show', label: 'Create a show', href: '/?wizard=true' });
  }
  if (viewer.isShowManagementStaff) {
    actions.push({
      id: 'open-show-management',
      label: 'Open Show Management',
      href: '/secretary/dashboard',
    });
  }
  return actions;
}

/**
 * The ordered actions for one route context. An empty list means the header
 * button is HIDDEN, not disabled.
 */
export function resolveActions(route: ActionRouteContext, viewer: ActionViewer): AppAction[] {
  if (route.kind === 'show') return buildShowActions(route.showId, route.shellMounted, viewer);
  return buildRoleWideActions(viewer);
}
