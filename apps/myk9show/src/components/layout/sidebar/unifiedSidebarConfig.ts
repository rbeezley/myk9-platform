/**
 * Unified Sidebar Configuration Builder
 *
 * Builds a single SidebarConfig from the user's active roles.
 * Browse section is always visible; role-specific sections appear
 * only when the user holds the corresponding role.
 */

import {
  LayoutDashboard,
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
} from 'lucide-react';
import { UserRole } from '@/types/auth-types';
import type { SidebarConfig, NavGroup } from './types';

function hasAnyRole(userRoles: UserRole[], required: UserRole[]): boolean {
  return required.some(r => userRoles.includes(r));
}

export function buildUnifiedSidebarConfig(userRoles: UserRole[]): SidebarConfig {
  const groups: NavGroup[] = [];

  // Browse — always visible
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

  // My Shows (exhibitor)
  if (hasAnyRole(userRoles, [UserRole.EXHIBITOR, UserRole.HANDLER])) {
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

  // Manage (secretary / club admin)
  if (hasAnyRole(userRoles, [UserRole.SECRETARY, UserRole.CLUB_ADMIN])) {
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
          title: 'Run Orders',
          href: '/secretary/run-order',
          icon: List,
          description: 'Class scheduling and ordering',
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
  } else if (hasAnyRole(userRoles, [UserRole.EXHIBITOR, UserRole.HANDLER])) {
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
        : hasAnyRole(userRoles, [UserRole.EXHIBITOR, UserRole.HANDLER])
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
