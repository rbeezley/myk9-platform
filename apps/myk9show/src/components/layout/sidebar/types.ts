/**
 * Shared types for role-based sidebar navigation.
 *
 * Used by AdminSidebar, SecretarySidebar, JudgeSidebar, ExhibitorSidebar.
 */

import type React from 'react';

export interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
  badge?: string;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export interface SidebarConfig {
  /** Navigation groups with items */
  groups: NavGroup[];
  /** The dashboard route for this role (used for exact-match active detection) */
  dashboardHref: string;
  /** User name shown in the sidebar header */
  headerTitle: string;
  /** Icon shown in the access-level footer */
  footerIcon: React.ComponentType<{ className?: string }>;
  /** Label shown in the access-level footer (e.g. "Judge Access") */
  footerLabel: string;
}
