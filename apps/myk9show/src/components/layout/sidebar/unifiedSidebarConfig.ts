/**
 * Unified Sidebar Configuration Builder
 *
 * Builds a single SidebarConfig from the user's active roles.
 *
 * Section Ordering (priority/visual hierarchy):
 * 1. Admin (if SITE_ADMIN)
 * 2. Manage (if SECRETARY)
 * 3. My Shows (if EXHIBITOR with other roles)
 * 4. Browse (always visible for non-exhibitor-only users)
 * 5. My Club (if CLUB_ADMIN; club-scoped links require context)
 * 6. Resources (if SITE_ADMIN)
 *
 * This ordering ensures primary role-based navigation appears first,
 * followed by browsing/discovery, then secondary management sections.
 * Exhibitor-only users get a simplified, role-agnostic sidebar.
 */

import {
  LayoutDashboard,
  Calendar,
  Heart,
  Users,
  Building2,
  FileText,
  Shield,
  ShieldCheck,
  Search,
  HelpCircle,
  Landmark,
  Wallet,
  Radio,
  Activity,
  LifeBuoy,
  Flag,
} from 'lucide-react';
import { UserRole, USER_ROLE_HIERARCHY } from '@/types/auth-types';
import { ROLE_LABELS } from '@/services/rbac/roleUiConstants';
import { rosterIsOwnDogsOnlyForRoles } from '@/utils/dogRosterScope';
import { isWizardSurface, isPathInWizardAllowlist } from '@/config/surface';
import type { SidebarConfig, NavGroup, NavItem, NavRailMenu } from './types';

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
// Flag, not Building2: Building2 is already the Clubs browse item's icon.
const CLUB_RAIL_MENU: NavRailMenu = { id: 'club', title: 'My Club', icon: Flag };

export function buildUnifiedSidebarConfig(
  userRoles: readonly UserRole[],
  clubContext?: ClubContext,
  firstName?: string | null
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
  const isPureSiteAdmin = hasSiteAdmin && userRoles.length === 1;
  const ownDogsOnly = rosterIsOwnDogsOnlyForRoles(userRoles);

  // Exhibitor-only users get a unified, plain-English sidebar
  const isExhibitorOnly =
    hasAnyRole(userRoles, [UserRole.EXHIBITOR]) &&
    !hasAnyRole(userRoles, [
      UserRole.JUDGE,
      UserRole.SECRETARY,
      UserRole.CLUB_ADMIN,
      UserRole.SITE_ADMIN,
    ]);

  if (isExhibitorOnly) {
    groups.push({
      title: '',
      items: [
        {
          title: 'My Shows',
          href: '/exhibitor/entries',
          icon: FileText,
          description: 'Your entries, dogs, and upcoming shows',
        },
        {
          title: 'My Dogs',
          href: '/dogs',
          icon: Heart,
        },
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
        {
          title: 'Find Shows',
          href: '/shows',
          icon: Search,
        },
      ],
    });
  } else {
    // Multi-role users: Build sections in priority order
    // 1. Admin section (highest priority)
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

    // 2. Manage section (secretary)
    if (hasSecretaryRole) {
      // One item: the secretary's shows (today's first) are the Shows list's Today group, not a
      // single next-show link here (docs/plan-sidebar-browse-pane.md, phase 2).
      groups.push({
        title: 'Manage',
        items: [
          {
            title: 'Show Management',
            // "Management" is wider than the rail; renamed there, never cut.
            railTitle: 'Manage',
            href: '/secretary/dashboard',
            icon: LayoutDashboard,
          },
        ],
      });
    }

    // 2b. Show Day — the always-available Ringside entry. Placed high (right
    // after Manage) because for a judge it may be the only section that matters,
    // and on show day it's the primary destination for every staff role.
    if (hasRingsideRole) {
      groups.push({ title: 'Show Day', items: [STAFF_RINGSIDE_NAV_ITEM] });
    }

    // 3. As Exhibitor section (exhibitor with other roles)
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

    // 4. Browse section (visible for role workflows; pure site-admin discovery lives in Help)
    if (!isPureSiteAdmin) {
      const browseItems: NavItem[] = [
        { title: 'Shows', href: '/shows', icon: Calendar },
        // This label follows the roster scope, while `isExhibitorOnly` above
        // remains role chrome: it controls the simplified sidebar branch and
        // card/table affordances, which are intentionally separate questions.
        { title: ownDogsOnly ? 'My Dogs' : 'Dogs', href: '/dogs', icon: Heart },
      ];
      // Clubs and People are secretary + admin only (privacy restriction — navigation-ia.md)
      if (hasAnyRole(userRoles, [UserRole.SECRETARY, UserRole.SITE_ADMIN])) {
        browseItems.push(
          {
            title: 'Clubs',
            href: '/clubs',
            icon: Building2,
          },
          {
            title: 'People',
            href: '/people',
            icon: Users,
          }
        );
      }
      groups.push({ title: 'Browse', items: browseItems });
    }

    // 5. My Club section. Stable account destinations remain available while
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

      groups.push({
        title: 'My Club',
        railMenu: CLUB_RAIL_MENU,
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
