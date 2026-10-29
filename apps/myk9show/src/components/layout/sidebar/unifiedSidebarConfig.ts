/**
 * Unified Sidebar Configuration Builder
 *
 * Builds a single SidebarConfig from the user's active roles.
 *
 * Section Ordering, top to bottom (MYK9-1490):
 * 1. Home (if SECRETARY)
 * 2. The current show (if the viewer manages one)
 * 3. Show Day / Ringside (staff roles; first for a judge)
 * 4. Browse (always visible for non-exhibitor-only users)
 * 5. As Exhibitor / My Entries (if EXHIBITOR with other roles)
 * 6. Admin (if SITE_ADMIN)
 * 7. My Club (if CLUB_ADMIN; club-scoped links require context)
 * 8. Resources (if SITE_ADMIN; folds into the Admin rail menu)
 *
 * Home is the hub and the current show its workspace, with Ringside (that show's live view)
 * beside it; then discovery, then the role-specific sections.
 * Exhibitor-only users get a simplified, role-agnostic sidebar.
 */

import {
  LayoutDashboard,
  House,
  Calendar,
  Users,
  Building2,
  FileText,
  Heart,
  Shield,
  ShieldCheck,
  HelpCircle,
  Landmark,
  Wallet,
  Radio,
  Activity,
  LifeBuoy,
  Flag,
  LayoutList,
  CalendarCheck,
} from 'lucide-react';
import { UserRole, USER_ROLE_HIERARCHY } from '@/types/auth-types';
import { ROLE_LABELS } from '@/services/rbac/roleUiConstants';
import { isWizardSurface, isPathInWizardAllowlist } from '@/config/surface';
import type { SidebarConfig, NavGroup, NavItem, NavRailLink, NavRailMenu } from './types';
import { browseTabsForRoles, isExhibitorOnlyRoles } from './browseTabs';
import { formatShowDateRange } from '@/lib/format/dates';
import { truncateRailTitle } from './currentShow';
import type { Show } from '@/types/show-types';

export interface ClubContext {
  clubId: string;
  clubName: string;
}

/**
 * The permanent at-show entry point, shown for every role. It targets the
 * bare `/at-show` route, which resolves the user's live show and either
 * auto-jumps into it or offers a chooser (see RingsideEntryPage). A static link
 * works precisely because the destination — not the link — supplies the showId.
 */
const STAFF_RINGSIDE_NAV_ITEM: NavItem = {
  title: 'Ringside',
  href: '/at-show',
  icon: Radio,
  description: 'Step into the ring on show day',
};

const EXHIBITOR_SHOW_DAY_NAV_ITEM: NavItem = {
  title: 'Ringside',
  href: '/at-show',
  icon: Radio,
  description: 'Find check-in, run order, and show-day details',
};

function hasAnyRole(userRoles: readonly UserRole[], required: readonly UserRole[]): boolean {
  return required.some(r => userRoles.includes(r));
}

// The rail folds the two longest sections into one labeled item each, so a
// secretary who is also club admin sees 9 rail items instead of 12, and a
// site admin 10 instead of 22 (docs/plan-sidebar-browse-pane.md, phase 1).
const ADMIN_RAIL_MENU: NavRailMenu = { id: 'admin', title: 'Admin', icon: Shield };
// Flag, not Building2: Building2 is the Clubs list's icon (browseTabs.ts).
const CLUB_RAIL_MENU: NavRailMenu = { id: 'club', title: 'My Club', icon: Flag };
const BROWSE_RAIL_LINK: NavRailLink = { id: 'browse', title: 'Browse', icon: LayoutList };

export interface CurrentShowNav {
  currentShow: ShowRef | null;
  /** Managed shows not yet over, soonest first; more than one turns on Switch. */
  managingShows: readonly ShowRef[];
  onChooseShow: (id: string) => void;
}

type ShowRef = Pick<Show, 'id' | 'name'> & Partial<Pick<Show, 'startDate' | 'endDate'>>;

function currentShowItem(
  show: ShowRef,
  onChooseShow?: (id: string) => void,
  description?: string
): NavItem {
  const short = truncateRailTitle(show.name);
  const dates = formatShowDateRange(show.startDate, show.endDate);
  return {
    title: show.name,
    // Only when it differs: the accessible name is "short: full" for a shortened label.
    ...(short === show.name ? {} : { railTitle: short, tooltip: show.name }),
    href: `/shows/${show.id}`,
    icon: CalendarCheck,
    ...(description ? { description } : {}),
    ...(dates ? { subtitle: dates } : {}),
    // Only a Switch pick is remembered; opening the current show must not pin it.
    ...(onChooseShow ? { onSelect: () => onChooseShow(show.id) } : {}),
  };
}

/** The current show first, then the other managed shows (Switch's list), each opening its Overview. */
function currentShowGroup({ currentShow, managingShows, onChooseShow }: CurrentShowNav): NavGroup {
  const others = managingShows.filter(show => show.id !== currentShow?.id);
  return {
    title: 'Current show',
    railSwitch: true,
    items: [
      ...(currentShow ? [currentShowItem(currentShow, undefined, 'Your current show')] : []),
      ...others.map(show => currentShowItem(show, onChooseShow, 'Switch to this show')),
    ],
  };
}

export function buildUnifiedSidebarConfig(
  userRoles: readonly UserRole[],
  clubContext?: ClubContext,
  firstName?: string | null,
  currentShowNav?: CurrentShowNav
): SidebarConfig {
  const groups: NavGroup[] = [];
  const hasSiteAdmin = hasAnyRole(userRoles, [UserRole.SITE_ADMIN]);
  const hasSecretaryRole = hasAnyRole(userRoles, [UserRole.SECRETARY]);
  const hasRingsideRole = hasAnyRole(userRoles, [
    UserRole.JUDGE,
    UserRole.SECRETARY,
    UserRole.CLUB_ADMIN,
    UserRole.CHAIRMAN,
    UserRole.STEWARD,
  ]);

  // Exhibitor-only users get a unified, plain-English sidebar
  const isExhibitorOnly = isExhibitorOnlyRoles(userRoles);

  if (isExhibitorOnly) {
    // Plain rail items (owner decision 2026-10-27, MYK9-1287): My Shows and My Dogs are
    // separate pages with no tablist and no remembered tab, unlike the staff Browse item. Finding
    // a show is a button on the My Shows list, not a rail item.
    groups.push({
      title: '',
      items: [
        {
          title: 'My Shows',
          href: '/exhibitor/entries',
          icon: FileText,
          description: 'Your entries, dogs, and upcoming shows',
        },
        { title: 'My Dogs', href: '/dogs', icon: Heart },
      ],
    });
    groups.push({
      title: '',
      items: [
        {
          title: 'My Payments',
          href: '/exhibitor/payments',
          icon: Wallet,
          // Not "and receipts": receipts are entry-scoped and live on My Shows.
          // This page only links out to them, and its own header says so.
          description: 'Your balance and online entry payments',
        },
        // Ringside resolves the right showId at the destination (RingsideEntryPage),
        // so a static link is safe even though an exhibitor may have several
        // shows. Complements the context-aware <ShowTodayBanner> on MyEntriesPage.
        EXHIBITOR_SHOW_DAY_NAV_ITEM,
      ],
    });
  } else {
    // Multi-role users: Build sections in priority order
    // 1. Home (secretary): the cross-show home, first because every other item is reached from it
    // (MYK9-1490; it was "Manage" / "Show Management").
    if (hasSecretaryRole) {
      groups.push({
        title: 'Home',
        items: [{ title: 'Home', href: '/secretary/dashboard', icon: House }],
      });
    }

    // 2. The current show, right under Home: a secretary or club admin's way back into the one show
    // being worked for days or weeks (MYK9-1269, moved up by MYK9-1490). Absent when they manage none.
    if (currentShowNav?.currentShow) groups.push(currentShowGroup(currentShowNav));

    // 3. Show Day — the always-available Ringside entry. Beside the current show, which it is the
    // live view of; and first of all for a judge, for whom it may be the only section that matters.
    if (hasRingsideRole) {
      groups.push({ title: 'Show Day', items: [STAFF_RINGSIDE_NAV_ITEM] });
    }

    // 4. Browse section: one rail item, Browse, opening the list used last; the list pages carry
    // the switch between them (BrowseTabs). The drawer keeps the lists by name under the "Browse"
    // heading, one tap each on a phone (docs/plan-sidebar-browse-pane.md, phase 3).
    const browseTabs = browseTabsForRoles(userRoles);
    if (browseTabs.length > 0) {
      groups.push({
        title: 'Browse',
        railLink: BROWSE_RAIL_LINK,
        items: browseTabs,
      });
    }

    // 5. As Exhibitor section (exhibitor with other roles): the rarest destination, so last of the
    // shared items
    if (hasAnyRole(userRoles, [UserRole.EXHIBITOR])) {
      groups.push({
        title: 'As Exhibitor',
        items: [
          {
            title: 'My Entries',
            href: '/exhibitor/entries',
            icon: FileText,
          },
        ],
      });
    }

    // 6. Admin section, then My Club: the role-specific groups, in their long-standing order
    if (hasSiteAdmin) {
      groups.push({
        title: 'Admin',
        railMenu: ADMIN_RAIL_MENU,
        items: [
          {
            title: 'Dashboard',
            href: '/admin/dashboard',
            icon: LayoutDashboard,
          },
          {
            title: 'System Health',
            href: '/admin/health',
            icon: Activity,
            description: 'Deployment and data checks',
          },
          { title: 'Users', href: '/admin/users', icon: Users },
          {
            title: 'Role Requests',
            href: '/admin/role-requests',
            icon: ShieldCheck,
            description: 'Review elevated access',
          },
          {
            title: 'Onboarding',
            href: '/admin/onboarding',
            icon: Building2,
            description: 'Club onboarding requests',
          },
          {
            title: 'Roles & Permissions',
            href: '/admin/permissions',
            icon: Shield,
            description: 'Access control',
          },
          {
            title: 'Payments',
            href: '/admin/payouts',
            icon: Wallet,
            description: 'Platform fee + payout ledger',
          },
          {
            title: 'Sport Rules',
            href: '/admin/templates',
            icon: FileText,
            description: 'Seeded class rules by registry (read-only)',
          },
        ],
      });
    }

    // 7. My Club section. Stable account destinations remain available while
    // club-scoped routes wait for validated context.
    if (hasAnyRole(userRoles, [UserRole.CLUB_ADMIN])) {
      const myClubItems: NavItem[] = [
        {
          title: 'Members',
          href: '/club-admin/members',
          icon: Users,
        },
        {
          title: 'Payments',
          href: '/club-admin/payments',
          icon: Landmark,
          description: 'Bank account and show payouts',
        },
      ];

      if (clubContext) {
        myClubItems.unshift({
          title: 'Our Shows',
          href: `/shows?club=${clubContext.clubId}`,
          icon: Calendar,
          description: `Shows for ${clubContext.clubName}`,
        });
        myClubItems.push({
          title: 'Club Profile',
          href: `/clubs/${clubContext.clubId}`,
          icon: Building2,
        });
      }

      // With a validated club the rail item is a link to the club page (MYK9-1293); a menu that
      // never navigates reads as broken. Without one there is no page to open, so keep the menu.
      groups.push({
        title: 'My Club',
        ...(clubContext
          ? {
              railLink: {
                id: 'my-club',
                title: 'My Club',
                icon: Flag,
                href: `/clubs/${clubContext.clubId}`,
              } satisfies NavRailLink,
            }
          : { railMenu: CLUB_RAIL_MENU }),
        items: myClubItems,
      });
    }
  }

  // Keep secondary assistance links at the end so operational work remains
  // visually distinct, especially for admins who also hold club roles.
  if (hasSiteAdmin) {
    groups.push({
      title: 'Resources',
      railMenu: ADMIN_RAIL_MENU,
      items: [
        {
          title: 'Support',
          href: '/admin/support',
          icon: LifeBuoy,
          description: 'Customer ticket inbox',
        },
        {
          title: 'Help',
          href: '/admin/help',
          icon: HelpCircle,
          // Not "every page": the directory is hand-authored and excludes
          // redirect-only routes by design, and the page's own drift panel
          // lists whatever is uncatalogued.
          description: 'Page directory, grouped by role',
        },
      ],
    });
  }

  // Keep identity and role context together in the account footer. The
  // canonical hierarchy determines which role leads for multi-role users;
  // the full role list remains available inside the account menu.
  const isAdmin = hasAnyRole(userRoles, [UserRole.SITE_ADMIN]);
  const uniqueRoles = [...new Set(userRoles)];
  const primaryRole = USER_ROLE_HIERARCHY.find(role => uniqueRoles.includes(role));
  const primaryRoleLabel = primaryRole ? ROLE_LABELS[primaryRole] : 'Browse';
  const additionalRoleCount = Math.max(0, uniqueRoles.length - 1);
  const accountName = firstName?.trim() || 'myK9';
  const accountRoleLabel =
    additionalRoleCount > 0 ? `${primaryRoleLabel} +${additionalRoleCount}` : primaryRoleLabel;

  // Dashboard href = first role-specific dashboard, or /shows for browse-only
  const dashboardHref = isAdmin
    ? '/admin/dashboard'
    : hasAnyRole(userRoles, [UserRole.SECRETARY])
      ? '/secretary/dashboard'
      : hasAnyRole(userRoles, [UserRole.CLUB_ADMIN])
        ? '/club-admin/members'
        : hasAnyRole(userRoles, [UserRole.EXHIBITOR])
          ? '/exhibitor/entries'
          : '/shows';

  // When the wizard surface is active, hide nav items that point at routes
  // the WizardSurfaceGate would 404. Site admins keep the full sidebar
  // because the gate already bypasses them. Empty groups are dropped so we
  // don't render orphan section headers.
  const filteredGroups: NavGroup[] =
    isWizardSurface && !isAdmin
      ? groups
          .map(group => ({
            ...group,
            items: group.items.filter(item => isPathInWizardAllowlist(item.href)),
          }))
          .filter(group => group.items.length > 0)
      : groups;

  return {
    groups: filteredGroups,
    dashboardHref,
    accountName,
    accountRoleLabel,
  };
}
