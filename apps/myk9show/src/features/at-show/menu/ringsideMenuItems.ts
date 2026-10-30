/**
 * The ringside menu's item list (MYK9-1508): pure, so the per-role contents and
 * the offline notices are unit-testable without rendering.
 *
 * Every item LINKS to a surface that already exists (the Account page, the show
 * page's Results tab, the Message Center, AskQ). Nothing here re-implements one.
 */
import type { LucideIcon } from 'lucide-react';
import { Bell, BarChart3, Info, LifeBuoy, LogOut, Medal, Settings } from 'lucide-react';
import { ringsideMenuExtensions } from './ringsideMenuExtensions';

export interface RingsideMenuContext {
  showId: string | undefined;
  /** May manage THIS show: the exact gate `ShowManagementSectionRoute` applies (`useShowManageScope`). */
  canManageShow: boolean;
  isOnline: boolean;
  /** The account has entries in this show, so the show page gives it the tabbed view with Show Stats. */
  hasEntries: boolean;
  /** A real account (not a passcode session). */
  hasAccount: boolean;
}

export type RingsideMenuAction = 'announcements' | 'askq' | 'show-info' | 'sign-out';

export interface RingsideMenuItem {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Route to open; the Up control's rule: a destination, never a second way out. */
  href?: string;
  /** Route prefix the return bar stays visible under (see ringsideReturnStore). */
  returnScope?: string;
  action?: RingsideMenuAction;
  requiresConnection: boolean;
}

/** Extension point: a later item (for example the Nationals Leaderboard) supplies one of these. */
export interface RingsideMenuExtension {
  id: string;
  /** Return the item to show for this viewer, or null to hide it. */
  build: (context: RingsideMenuContext) => RingsideMenuItem | null;
}

export const OFFLINE_ITEM_NOTICE = 'Needs a connection';

/** Where Results and Stats live: the manager's page, or the show page's own tab. */
function resultsHref(context: RingsideMenuContext, showId: string, view?: 'show-stats'): string {
  const base = `/shows/${showId}`;
  const params = new URLSearchParams();
  if (!context.canManageShow) params.set('tab', 'results');
  if (view) params.set('resultsView', view);
  const query = params.toString();
  return `${base}${context.canManageShow ? '/results' : ''}${query ? `?${query}` : ''}`;
}

export function buildRingsideMenuItems(
  context: RingsideMenuContext,
  extensions: readonly RingsideMenuExtension[] = ringsideMenuExtensions
): RingsideMenuItem[] {
  const { showId } = context;
  const showScope = showId ? `/shows/${showId}` : null;
  const items: Array<RingsideMenuItem | null> = [
    {
      id: 'announcements',
      label: 'Announcements',
      icon: Bell,
      action: 'announcements',
      requiresConnection: false,
    },
    // A passcode session has no account, so /account would bounce it to sign-in.
    context.hasAccount
      ? {
          id: 'settings',
          label: 'Settings',
          icon: Settings,
          href: '/account?section=appearance',
          returnScope: '/account',
          requiresConnection: false,
        }
      : null,
    // Show Stats renders only in the entered-exhibitor tab view: a manager's
    // Results page and the public landing have no statistics to land on.
    showId && showScope && context.hasEntries && !context.canManageShow
      ? {
          id: 'stats',
          label: 'Stats',
          icon: BarChart3,
          href: resultsHref(context, showId, 'show-stats'),
          returnScope: showScope,
          requiresConnection: true,
        }
      : null,
    showId && showScope
      ? {
          id: 'results',
          label: 'Results',
          icon: Medal,
          href: resultsHref(context, showId),
          returnScope: showScope,
          requiresConnection: true,
        }
      : null,
    {
      id: 'show-info',
      label: 'Show info',
      icon: Info,
      action: 'show-info',
      requiresConnection: false,
    },
    {
      id: 'askq',
      label: 'Ask for help (AskQ)',
      icon: LifeBuoy,
      action: 'askq',
      requiresConnection: true,
    },
    ...extensions.map(extension => extension.build(context)),
    {
      id: 'sign-out',
      label: 'Sign out',
      icon: LogOut,
      action: 'sign-out',
      requiresConnection: false,
    },
  ];
  return items.filter((item): item is RingsideMenuItem => item !== null);
}

/** An online-only item while offline: it explains itself instead of failing. */
export function itemNeedsConnection(item: RingsideMenuItem, isOnline: boolean): boolean {
  return item.requiresConnection && !isOnline;
}
