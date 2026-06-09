/**
 * Unified Sidebar Configuration Builder
 *
 * Builds a single SidebarConfig from the user's active roles.
 *
 * Section Ordering (priority/visual hierarchy):
 * 1. Admin (if SITE_ADMIN)
 * 2. Manage (if SECRETARY, CLUB_ADMIN, or SITE_ADMIN)
 * 3. My Shows (if EXHIBITOR with other roles)
 * 4. Browse (always visible for non-exhibitor-only users)
 * 5. My Club (if CLUB_ADMIN or SITE_ADMIN with club context)
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
  Scale,
  ClipboardCheck,
  FileText,
  List,
  Crown,
  Shield,
  ShieldCheck,
  Compass,
  Search,
  FileBarChart,
  Send,
  ListChecks,
  HelpCircle,
  BarChart3,
} from 'lucide-react';
import { UserRole } from '@/types/auth-types';
import { isWizardSurface, isPathInWizardAllowlist } from '@/config/surface';
import type { SidebarConfig, NavGroup, NavItem } from './types';

export interface ClubContext {
  clubId: string;
  clubName: string;
}

export interface NextShowContext {
  id: string;
  name: string;
  phase: 'today' | 'upcoming' | 'draft';
}

function hasAnyRole(userRoles: UserRole[], required: UserRole[]): boolean {
  return required.some(r => userRoles.includes(r));
}

function nextShowDescription(phase: NextShowContext['phase']): string {
  if (phase === 'today') return 'Live today';
  if (phase === 'draft') return 'Draft · finish setup';
  return 'Setup & scheduling';
}

export function buildUnifiedSidebarConfig(
  userRoles: UserRole[],
  clubContext?: ClubContext,
  nextShow?: NextShowContext
): SidebarConfig {
  const groups: NavGroup[] = [];

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
          description: 'Manage your dogs and registrations',
        },
        {
          title: 'My Stats',
          href: '/exhibitor/analytics',
          icon: BarChart3,
          description: 'Lifetime performance and qualification trends',
        },
        // NOTE: No standalone "Show Day" item. The at-show/ringside experience
        // (`/at-show/:showId`) is inherently per-show, and an exhibitor may be
        // entered in several shows — a static link can't supply the right
        // showId. The canonical, context-aware entry point is <ShowTodayBanner>
        // on MyEntriesPage (the "My Shows" page), which appears on show day and
        // deep-links to the correct show. A prior link to the retired
        // `/exhibitor/show-day` route was removed for this reason.
        {
          title: 'Find Shows',
          href: '/shows',
          icon: Search,
          description: 'Browse and enter shows',
        },
      ],
    });
  } else {
    // Multi-role users: Build sections in priority order
    // 1. Admin section (highest priority)
    if (hasAnyRole(userRoles, [UserRole.SITE_ADMIN])) {
      groups.push({
        title: 'Admin',
        items: [
          {
            title: 'Dashboard',
            href: '/admin/dashboard',
            icon: LayoutDashboard,
            description: 'System overview',
          },
          { title: 'Users', href: '/admin/users', icon: Users, description: 'User accounts' },
          {
            title: 'Role Requests',
            href: '/admin/role-requests',
            icon: ShieldCheck,
            description: 'Review elevated access',
          },
          {
            title: 'Roles & Permissions',
            href: '/admin/permissions',
            icon: Shield,
            description: 'Access control',
          },
          {
            title: 'Help',
            href: '/admin/help',
            icon: HelpCircle,
            description: 'Directory of every page in myK9Show',
          },
        ],
      });
    }

    // 2. Manage section (secretary / club admin)
    if (hasAnyRole(userRoles, [UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN])) {
      const manageDashboardHref = hasAnyRole(userRoles, [UserRole.SECRETARY, UserRole.SITE_ADMIN])
        ? '/secretary/dashboard'
        : '/club-admin/members';

      const manageItems: NavItem[] = [
        {
          title: 'Dashboard',
          href: manageDashboardHref,
          icon: LayoutDashboard,
          description: 'Show management dashboard',
        },
        {
          title: 'Entries',
          href: '/secretary/entries',
          icon: FileText,
          description: 'Manage show entries',
        },
      ];

      if (nextShow) {
        manageItems.push({
          title: nextShow.name,
          href:
            nextShow.phase === 'today'
              ? `/secretary/shows/${nextShow.id}?phase=show-desk`
              : `/secretary/shows/${nextShow.id}?phase=setup`,
          icon: nextShow.phase === 'today' ? ClipboardCheck : List,
          description: nextShowDescription(nextShow.phase),
        });
      }

      manageItems.push(
        {
          title: 'Reports',
          href: '/secretary/reports',
          icon: FileBarChart,
          description: 'Generate and print reports',
        },
        {
          title: 'Results Control',
          href: '/secretary/results-control',
          icon: ListChecks,
          description: 'Verify results and release to exhibitors',
        },
        {
          title: 'Submit Results',
          href: '/secretary/results-submission',
          icon: Send,
          description: 'Submit results to sanctioning organizations',
        }
      );

      groups.push({ title: 'Manage', items: manageItems });
    }

    // 3. As Exhibitor section (exhibitor with other roles)
    if (hasAnyRole(userRoles, [UserRole.EXHIBITOR])) {
      groups.push({
        title: 'As Exhibitor',
        items: [
          {
            title: 'My Shows',
            href: '/exhibitor/entries',
            icon: FileText,
            description: 'Your entries, dogs, and upcoming shows',
          },
        ],
      });
    }

    // 4. Browse section (always visible for non-exhibitor-only users)
    const browseItems: NavItem[] = [
      { title: 'Shows', href: '/shows', icon: Calendar, description: 'Find and explore shows' },
      { title: 'Dogs', href: '/dogs', icon: Heart, description: 'Browse dogs' },
    ];
    // Clubs and People are secretary + admin only (privacy restriction — navigation-ia.md)
    if (hasAnyRole(userRoles, [UserRole.SECRETARY, UserRole.SITE_ADMIN])) {
      browseItems.push(
        {
          title: 'Clubs',
          href: '/clubs',
          icon: Building2,
          description: 'Browse clubs',
        },
        {
          title: 'People',
          href: '/people',
          icon: Users,
          description: 'Browse people',
        }
      );
    }
    groups.push({ title: 'Browse', items: browseItems });

    // 5. My Club section (club admin — only if club context is available)
    if (clubContext && hasAnyRole(userRoles, [UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN])) {
      groups.push({
        title: 'My Club',
        items: [
          {
            title: 'Our Shows',
            href: `/shows?club=${clubContext.clubId}`,
            icon: Calendar,
            description: `Shows for ${clubContext.clubName}`,
          },
          {
            title: 'Members',
            href: '/club-admin/members',
            icon: Users,
            description: 'Manage club members',
          },
          {
            title: 'Club Profile',
            href: `/clubs/${clubContext.clubId}`,
            icon: Building2,
            description: 'Club details and settings',
          },
        ],
      });
    }
  }

  // Determine header/footer branding based on highest role
  const isAdmin = hasAnyRole(userRoles, [UserRole.SITE_ADMIN]);
  const isSecretary = hasAnyRole(userRoles, [UserRole.SECRETARY, UserRole.CLUB_ADMIN]);
  const isJudge = hasAnyRole(userRoles, [UserRole.JUDGE]);

  let headerIcon = Compass;
  let headerTitle = 'myK9';
  let footerIcon = Compass;
  let footerLabel = 'Browse';
  let footerDescription = 'Explore shows, dogs, and clubs';

  if (isAdmin) {
    headerIcon = Crown;
    headerTitle = 'myK9 Admin';
    footerIcon = Shield;
    footerLabel = 'Admin Access';
    footerDescription = 'Full system administration';
  } else if (isSecretary) {
    headerIcon = Building2;
    headerTitle = 'myK9 Manager';
    footerIcon = Building2;
    footerLabel = 'Manager Access';
    footerDescription = 'Show management and coordination';
  } else if (isJudge) {
    headerIcon = Scale;
    headerTitle = 'myK9 Judge';
    footerIcon = Scale;
    footerLabel = 'Judge Access';
    footerDescription = 'Scoring and evaluation';
  } else if (hasAnyRole(userRoles, [UserRole.EXHIBITOR])) {
    headerIcon = Heart;
    headerTitle = 'myK9 Exhibitor';
    footerIcon = Heart;
    footerLabel = 'Exhibitor Access';
    footerDescription = 'Show entries and dog management';
  }

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
          .map((group) => ({
            ...group,
            items: group.items.filter((item) => isPathInWizardAllowlist(item.href)),
          }))
          .filter((group) => group.items.length > 0)
      : groups;

  return {
    groups: filteredGroups,
    dashboardHref,
    headerIcon,
    headerTitle,
    footerIcon,
    footerLabel,
    footerDescription,
  };
}
