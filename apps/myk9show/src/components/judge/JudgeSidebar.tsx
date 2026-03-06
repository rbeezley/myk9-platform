/**
 * Judge Sidebar Navigation Component
 *
 * Declares navigation config for the judge console.
 * INTENT: "Invisible technology" — judges want to glance and go.
 * Rendering delegated to shared RoleSidebar.
 */

import React from 'react';
import { LayoutDashboard, Scale, ClipboardCheck, Calendar, Users, BarChart3 } from 'lucide-react';
import { RoleSidebar } from '@/components/layout/sidebar';
import type { SidebarConfig, RoleSidebarWrapperProps } from '@/components/layout/sidebar';

export const judgeSidebarConfig: SidebarConfig = {
  headerIcon: Scale,
  headerTitle: 'Judge Console',
  dashboardHref: '/judge/dashboard',
  footerIcon: Scale,
  footerLabel: 'Judge Access',
  footerDescription: 'Scoring and evaluation privileges',
  groups: [
    {
      title: 'Overview',
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
      ],
    },
    {
      title: 'Scoring',
      items: [
        {
          title: 'Check-In',
          href: '/judge/check-in',
          icon: ClipboardCheck,
          description: 'Class check-in management',
        },
      ],
    },
    {
      title: 'Browse',
      items: [
        {
          title: 'Shows',
          href: '/judge/shows',
          icon: Calendar,
          description: 'Browse shows',
        },
        {
          title: 'People',
          href: '/judge/people',
          icon: Users,
          description: 'Browse people',
        },
      ],
    },
  ],
};

export const JudgeSidebar: React.FC<RoleSidebarWrapperProps> = props => (
  <RoleSidebar config={judgeSidebarConfig} {...props} />
);

export default JudgeSidebar;
