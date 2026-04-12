/**
 * Unified Sidebar Configuration Builder
 *
 * Builds a single SidebarConfig from the user's active roles.
 *
 * Section Ordering (priority/visual hierarchy):
 * 1. Admin (if SITE_ADMIN)
 * 2. Manage (if SECRETARY, CLUB_ADMIN, or SITE_ADMIN)
 * 3. Judging (if JUDGE)
 * 4. My Shows (if EXHIBITOR with other roles)
 * 5. Browse (always visible for non-exhibitor-only users)
 * 6. My Club (if CLUB_ADMIN or SITE_ADMIN with club context)
 *
 * This ordering ensures primary role-based navigation appears first,
 * followed by browsing/discovery, then secondary management sections.
 * Exhibitor-only users get a simplified, role-agnostic sidebar.
 */

import {
  LayoutDashboard,
  Home,
  Activity,
  Calendar,
  CalendarDays,
  Heart,
  Users,
  Building2,
  Scale,
  BarChart3,
  ClipboardCheck,
  FileText,
  History,
  Plus,
  List,
  User,
  Crown,
  Shield,
  Compass,
  Settings,
  Search,
  KanbanSquare,
  MessageSquare,
  FileBarChart,
  Send,
  ListChecks,
} from 'lucide-react';
import { UserRole } from '@/types/auth-types';
import type { SidebarConfig, NavGroup } from './types';

export interface ClubContext {
  clubId: string;
  clubName: string;
}

function hasAnyRole(userRoles: UserRole[], required: UserRole[]): boolean {
  return required.some(r => userRoles.includes(r));
}

export function buildUnifiedSidebarConfig(
  userRoles: UserRole[],
  clubContext?: ClubContext
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
          title: 'Home',
          href: '/exhibitor/dashboard',
          icon: Home,
          description: "What's coming up",
        },
        {
          title: 'Show Day',
          href: '/exhibitor/show-day',
          icon: Activity,
          description: 'Check-in, run order, results',
        },
      ],
    });
    groups.push({
      title: '',
      items: [
        { title: 'My Dogs', href: '/dogs', icon: Heart, description: 'Dog profiles and history' },
        {
          title: 'My Entries',
          href: '/exhibitor/entries',
          icon: FileText,
          description: 'Current and past entries',
        },
      ],
    });
    groups.push({
      title: '',
      items: [
        {
          title: 'Find Shows',
          href: '/shows',
          icon: Search,
          description: 'Browse and enter shows',
        },
        { title: 'Clubs', href: '/clubs', icon: Building2, description: 'Browse clubs' },
        { title: 'Calendar', href: '/calendar', icon: CalendarDays, description: 'Event calendar' },
      ],
    });
    groups.push({
      title: '',
      items: [
        {
          title: 'Settings',
          href: '/preferences',
          icon: Settings,
          description: 'Profile and preferences',
        },
        {
          title: 'Messages',
          href: '/messages',
          icon: MessageSquare,
          description: 'Chat with the trial secretary',
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
            title: 'Roles & Permissions',
            href: '/admin/permissions',
            icon: Shield,
            description: 'Access control',
          },
        ],
      });
    }

    // 2. Manage section (secretary / club admin)
    if (hasAnyRole(userRoles, [UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN])) {
      groups.push({
        title: 'Manage',
        items: [
          {
            title: 'Pipeline',
            href: '/secretary/dashboard',
            icon: LayoutDashboard,
            description: 'Show management pipeline',
          },
          {
            title: 'Create Show',
            href: '/secretary/create-show',
            icon: Plus,
            description: 'Start a new show',
          },
          {
            title: 'Entries',
            href: '/secretary/entries',
            icon: FileText,
            description: 'Manage show entries',
          },
          {
            title: 'Day-of Ops',
            href: '/secretary/day-of',
            icon: ClipboardCheck,
            description: 'Walk-ins, scratches, move-ups',
          },
          {
            title: 'Tasks',
            href: '/secretary/tasks',
            icon: KanbanSquare,
            description: 'Kanban task board',
          },
          {
            title: 'Run Orders',
            href: '/secretary/run-order',
            icon: List,
            description: 'Class scheduling and ordering',
          },
          {
            title: 'Messages',
            href: '/secretary/messages',
            icon: MessageSquare,
            description: 'Chat with exhibitors and participants',
          },
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
            description: 'Send results to AKC, UKC, and others',
          },
        ],
      });
    }

    // 3. Judging section
    if (hasAnyRole(userRoles, [UserRole.JUDGE])) {
      groups.push({
        title: 'Judging',
        items: [
          {
            title: 'Dashboard',
            href: '/judge/dashboard',
            icon: LayoutDashboard,
            description: "Today's assignments",
          },
          {
            title: 'My Stats',
            href: '/judge/stats',
            icon: BarChart3,
            description: 'Season performance',
          },
          {
            title: 'Check-In',
            href: '/judge/check-in',
            icon: ClipboardCheck,
            description: 'Class check-in management',
          },
        ],
      });
    }

    // 4. My Shows section (exhibitor with other roles)
    if (hasAnyRole(userRoles, [UserRole.EXHIBITOR])) {
      groups.push({
        title: 'My Shows',
        items: [
          {
            title: 'Dashboard',
            href: '/exhibitor/dashboard',
            icon: LayoutDashboard,
            description: 'Overview and quick actions',
          },
          {
            title: 'My Account',
            href: '/exhibitor/account',
            icon: User,
            description: 'Profile and preferences',
          },
          {
            title: 'Current Entries',
            href: '/exhibitor/entries',
            icon: FileText,
            description: 'Active show entries',
          },
          {
            title: 'Entry History',
            href: '/exhibitor/entries/history',
            icon: History,
            description: 'Past entries and records',
          },
          {
            title: 'Messages',
            href: '/messages',
            icon: MessageSquare,
            description: 'Chat with the trial secretary',
          },
        ],
      });
    }

    // 5. Browse section (always visible for non-exhibitor-only users)
    groups.push({
      title: 'Browse',
      items: [
        { title: 'Shows', href: '/shows', icon: Calendar, description: 'Find and explore shows' },
        { title: 'Dogs', href: '/dogs', icon: Heart, description: 'Browse dogs' },
        { title: 'People', href: '/people', icon: Users, description: 'Browse people' },
        { title: 'Clubs', href: '/clubs', icon: Building2, description: 'Browse clubs' },
        { title: 'Calendar', href: '/calendar', icon: CalendarDays, description: 'Event calendar' },
      ],
    });

    // 6. My Club section (club admin — only if club context is available)
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
    : isSecretary
      ? '/secretary/dashboard'
      : isJudge
        ? '/judge/dashboard'
        : hasAnyRole(userRoles, [UserRole.EXHIBITOR])
          ? '/exhibitor/dashboard'
          : '/shows';

  return {
    groups,
    dashboardHref,
    headerIcon,
    headerTitle,
    footerIcon,
    footerLabel,
    footerDescription,
  };
}
