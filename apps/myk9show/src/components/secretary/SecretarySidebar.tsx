/**
 * Secretary Sidebar Navigation Component
 *
 * Declares navigation config for the secretary console.
 * Rendering delegated to shared RoleSidebar.
 */

import React from 'react';
import {
  LayoutDashboard,
  Calendar,
  CalendarDays,
  Plus,
  FileText,
  List,
  Users,
  Heart,
  Building2,
  ClipboardList,
} from 'lucide-react';
import { RoleSidebar } from '@/components/layout/sidebar';
import type { SidebarConfig, RoleSidebarWrapperProps } from '@/components/layout/sidebar';

export const secretarySidebarConfig: SidebarConfig = {
  headerIcon: ClipboardList,
  headerTitle: 'Secretary Console',
  dashboardHref: '/secretary/dashboard',
  footerIcon: ClipboardList,
  footerLabel: 'Secretary Access',
  footerDescription: 'Show management and coordination privileges',
  groups: [
    {
      title: 'Overview',
      items: [
        {
          title: 'Dashboard',
          href: '/secretary/dashboard',
          icon: LayoutDashboard,
          description: 'Overview and quick actions',
        },
      ],
    },
    {
      title: 'Show Management',
      items: [
        {
          title: 'My Shows',
          href: '/secretary/shows',
          icon: Calendar,
          description: 'Shows you are managing',
        },
        {
          title: 'Create Show',
          href: '/secretary/create-show',
          icon: Plus,
          description: 'Start a new show',
        },
      ],
    },
    {
      title: 'Entry Management',
      items: [
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
    },
    {
      title: 'Participants',
      items: [
        {
          title: 'People',
          href: '/secretary/users',
          icon: Users,
          description: 'Exhibitors and handlers',
        },
        {
          title: 'Dogs',
          href: '/secretary/dogs',
          icon: Heart,
          description: 'Registered dogs',
        },
        {
          title: 'Clubs',
          href: '/secretary/clubs',
          icon: Building2,
          description: 'Club management',
        },
      ],
    },
    {
      title: 'Tools',
      items: [
        {
          title: 'Calendar',
          href: '/secretary/calendar',
          icon: CalendarDays,
          description: 'Event scheduling',
        },
      ],
    },
  ],
};

export const SecretarySidebar: React.FC<RoleSidebarWrapperProps> = props => (
  <RoleSidebar config={secretarySidebarConfig} {...props} />
);

export default SecretarySidebar;
