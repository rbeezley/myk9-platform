/**
 * Admin Sidebar Navigation Component
 *
 * Declares navigation config for the admin console.
 * Rendering delegated to shared RoleSidebar.
 */

import React from 'react';
import {
  LayoutDashboard,
  Bell,
  BarChart3,
  TrendingUp,
  Database,
  Zap,
  TestTube,
  Users,
  Shield,
  FileSearch,
  Settings,
  FileText,
  RefreshCw,
  Crown,
} from 'lucide-react';
import { RoleSidebar } from '@/components/layout/sidebar';
import type { SidebarConfig } from '@/components/layout/sidebar';

export const adminSidebarConfig: SidebarConfig = {
  headerIcon: Crown,
  headerTitle: 'Admin Console',
  footerIcon: Shield,
  footerLabel: 'Admin Access',
  footerDescription: 'Full system administration privileges',
  groups: [
    {
      title: 'Overview',
      items: [
        {
          title: 'Dashboard',
          href: '/admin/dashboard',
          icon: LayoutDashboard,
          description: 'System overview and quick actions',
        },
      ],
    },
    {
      title: 'Monitoring & Analytics',
      items: [
        {
          title: 'Alerts',
          href: '/admin/alerts',
          icon: Bell,
          description: 'System alerts and notifications',
        },
        {
          title: 'Performance',
          href: '/admin/performance',
          icon: TrendingUp,
          description: 'Performance metrics and optimization',
        },
        {
          title: 'Analytics',
          href: '/admin/analytics',
          icon: BarChart3,
          description: 'Usage analytics and insights',
        },
      ],
    },
    {
      title: 'System Management',
      items: [
        {
          title: 'Data Lifecycle',
          href: '/admin/data-lifecycle',
          icon: Database,
          description: 'Data management and archiving',
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
          description: 'System load testing and benchmarks',
        },
        {
          title: 'Sync Management',
          href: '/admin/sync',
          icon: RefreshCw,
          description: 'Data synchronization controls',
        },
      ],
    },
    {
      title: 'User Management',
      items: [
        {
          title: 'Users',
          href: '/admin/users',
          icon: Users,
          description: 'User accounts and profiles',
        },
        {
          title: 'Roles & Permissions',
          href: '/admin/permissions',
          icon: Shield,
          description: 'Access control management',
        },
        {
          title: 'Permission Audit',
          href: '/admin/permissions/audit',
          icon: FileSearch,
          description: 'Security audit and logs',
        },
      ],
    },
    {
      title: 'Configuration',
      items: [
        {
          title: 'Templates',
          href: '/admin/templates',
          icon: FileText,
          description: 'Show and class templates',
        },
        {
          title: 'System Settings',
          href: '/admin/settings',
          icon: Settings,
          description: 'Global system configuration',
        },
      ],
    },
  ],
};

interface AdminSidebarProps {
  onCloseMobile?: () => void;
  isCollapsed?: boolean;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = props => (
  <RoleSidebar config={adminSidebarConfig} {...props} />
);

export default AdminSidebar;
