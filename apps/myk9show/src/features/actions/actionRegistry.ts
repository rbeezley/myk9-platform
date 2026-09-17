import {
  buildExhibitorRegistrationPath,
  buildSecretaryRegistrationPath,
} from '@/pages/RegistrationWizardPage.routes';
import { PREMIUM_CARD_ANCHOR } from '@/features/show-workbench/publishReadiness';

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
export interface AppAction {
  id: string;
  label: string;
  /** Where this action lives. Registry items are links by design. */
  href: string;
  /** Present when the item belongs here but the viewer cannot use it. */
  disabledReason?: string;
  /** Renders a divider above this item. */
  separatorBefore?: boolean;
  destructive?: boolean;
}

export type ActionRouteContext = { kind: 'show'; showId: string } | { kind: 'global' };

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
 * The route context a pathname puts the viewer in. Pure, so both doors (header
 * menu and command palette) derive it identically and it is unit-testable
 * without a router.
 */
export function parseActionRouteContext(pathname: string): ActionRouteContext {
  for (const pattern of [SHOW_PATH, SECRETARY_REGISTER_PATH]) {
    const match = pattern.exec(pathname);
    const raw = match?.[1];
    if (raw) return { kind: 'show', showId: decodeURIComponent(raw) };
  }
  return { kind: 'global' };
}

function buildShowActions(showId: string, viewer: ActionViewer): AppAction[] {
  if (!viewer.canManageShow) return [];

  const encoded = encodeURIComponent(showId);
  const mailInEntry: AppAction = {
    id: 'show-add-mail-in-entry',
    label: 'Add mail-in entry',
    href: buildSecretaryRegistrationPath(showId),
    ...(viewer.canOperateShow ? {} : { disabledReason: 'Trial secretary access only' }),
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
      label: 'Open Entry Management',
      href: `/shows/${encoded}/entry-management`,
    },
    {
      id: 'show-open-show-desk',
      label: 'Open Show Desk',
      href: `/shows/${encoded}/show-desk`,
    },
    {
      // A link to the publish row that stays on Overview, matching how the
      // setup-readiness checklist already jumps there -- not a second
      // generate/publish button.
      id: 'show-generate-publish-premium',
      label: 'Generate & publish premium',
      href: `/shows/${encoded}#${PREMIUM_CARD_ANCHOR}`,
      separatorBefore: true,
    },
    {
      id: 'show-settings',
      label: 'Show settings…',
      href: `/shows/${encoded}?edit=true`,
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
  if (route.kind === 'show') return buildShowActions(route.showId, viewer);
  return buildRoleWideActions(viewer);
}
