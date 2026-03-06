/**
 * Exhibitor Sidebar Navigation Component
 *
 * Declares navigation config for the exhibitor console.
 * Rendering delegated to shared RoleSidebar.
 */

import React from 'react';
import { LayoutDashboard, FileText, History, Search, Calendar, Heart, User } from 'lucide-react';
import { RoleSidebar } from '@/components/layout/sidebar';
import type { SidebarConfig, RoleSidebarWrapperProps } from '@/components/layout/sidebar';

export const exhibitorSidebarConfig: SidebarConfig = {
  headerIcon: Heart,
  headerTitle: 'Exhibitor Console',
  dashboardHref: '/exhibitor/dashboard',
  footerIcon: Heart,
  footerLabel: 'Exhibitor Access',
  footerDescription: 'Show entry and dog management privileges',
  groups: [
    {
      title: 'Overview',
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
      ],
    },
    {
      title: 'My Entries',
      items: [
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
    },
    {
      title: 'Show Discovery',
      items: [
        {
          title: 'Browse Shows',
          href: '/shows',
          icon: Search,
          description: 'Find and explore shows',
        },
        {
          title: 'Event Calendar',
          href: '/calendar',
          icon: Calendar,
          description: 'Show calendar and schedules',
        },
      ],
    },
    {
      title: 'My Dogs',
      items: [
        {
          title: 'Dog Profiles',
          href: '/dogs',
          icon: Heart,
          description: 'Manage your dogs',
        },
      ],
    },
  ],
};

export const ExhibitorSidebar: React.FC<RoleSidebarWrapperProps> = props => (
  <RoleSidebar config={exhibitorSidebarConfig} {...props} />
);

export default ExhibitorSidebar;
