/**
 * Unified Sidebar Configuration Builder
 *
 * Builds a single SidebarConfig from the user's active roles.
 * Browse section is always visible; role-specific sections appear
 * only when the user holds the corresponding role.
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
  Bell,
  TrendingUp,
  Database,
  Zap,
  TestTube,
  RefreshCw,
  FileSearch,
  Compass,
  UserPlus,
  Settings,
  Search,
  KanbanSquare,
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
      ],
    });
  } else {
    // Browse — visible for non-exhibitor-only users
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

    // My Shows (exhibitor with other roles)
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
        ],
      });
    }
  }

  // Judging
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

  // Manage (secretary / club admin / site admin)
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
          title: 'Settings',
          href: '/secretary/settings',
          icon: Settings,
          description: 'Results visibility and check-in settings',
        },
      ],
    });
  }

  // My Club (club admin — only if club context is available)
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

  // Admin
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
        { title: 'Alerts', href: '/admin/alerts', icon: Bell, description: 'System alerts' },
        {
          title: 'Performance',
          href: '/admin/performance',
          icon: TrendingUp,
          description: 'Performance metrics',
        },
        {
          title: 'Analytics',
          href: '/admin/analytics',
          icon: BarChart3,
          description: 'Usage analytics',
        },
        {
          title: 'Data Lifecycle',
          href: '/admin/data-lifecycle',
          icon: Database,
          description: 'Data management',
        },
        {
          title: 'Performance Mode',
          href: '/admin/performance-mode',
          icon: Zap,
          description: 'System performance controls',
        },
        {
          title: 'Load Testing',
          href: '/admin/load-testing',
          icon: TestTube,
          description: 'Load testing and benchmarks',
        },
        {
          title: 'Sync',
          href: '/admin/sync',
          icon: RefreshCw,
          description: 'Data synchronization',
        },
        { title: 'Users', href: '/admin/users', icon: Users, description: 'User accounts' },
        {
          title: 'Roles & Permissions',
          href: '/admin/permissions',
          icon: Shield,
          description: 'Access control',
        },
        {
          title: 'Permission Audit',
          href: '/admin/permissions/audit',
          icon: FileSearch,
          description: 'Security audit',
        },
        {
          title: 'Templates',
          href: '/admin/templates',
          icon: FileText,
          description: 'Show and class templates',
        },
        {
          title: 'Onboarding',
          href: '/admin/onboarding',
          icon: UserPlus,
          description: 'Club onboarding requests',
        },
      ],
    });
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
