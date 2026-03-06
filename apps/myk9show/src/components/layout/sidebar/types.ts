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
  icon?: React.ComponentType<{ className?: string }>;
  items: NavItem[];
}

export interface SidebarConfig {
  /** Navigation groups with items */
  groups: NavGroup[];
  /** Icon shown in sidebar header and collapsed footer */
  headerIcon: React.ComponentType<{ className?: string }>;
  /** Title shown in sidebar header (e.g. "Judge Console") */
  headerTitle: string;
  /** Icon shown in footer badge area */
  footerIcon: React.ComponentType<{ className?: string }>;
  /** Label for footer badge (e.g. "Judge Access") */
  footerLabel: string;
  /** Description for footer badge */
  footerDescription: string;
}
