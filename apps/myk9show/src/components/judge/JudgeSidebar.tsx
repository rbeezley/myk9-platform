/**
 * Judge Sidebar Navigation Component
 *
 * Declares navigation config for the judge console.
 * INTENT: "Invisible technology" — judges want to glance and go.
 * Rendering delegated to shared RoleSidebar.
 */

import React from 'react';
import { LayoutDashboard, Scale, ClipboardCheck, Calendar, Users } from 'lucide-react';
import { RoleSidebar } from '@/components/layout/sidebar';
import type { SidebarConfig } from '@/components/layout/sidebar';

export const judgeSidebarConfig: SidebarConfig = {
  headerIcon: Scale,
  headerTitle: 'Judge Console',
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

interface JudgeSidebarProps {
  onCloseMobile?: () => void;
  isCollapsed?: boolean;
}

export const JudgeSidebar: React.FC<JudgeSidebarProps> = props => (
  <RoleSidebar config={judgeSidebarConfig} {...props} />
);

export default JudgeSidebar;
