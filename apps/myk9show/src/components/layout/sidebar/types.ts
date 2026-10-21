/**
 * Shared types for role-based sidebar navigation.
 *
 * Built by buildUnifiedSidebarConfig; rendered by RoleSidebar (drawer) and RailNav (rail).
 */

import type React from 'react';

export interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
  badge?: string;
  /**
   * Short label for the desktop rail when `title` cannot fit in two short
   * lines (a show's name). The full title stays in the accessible name.
   */
  railTitle?: string;
  /** Hover text for the rail link, set only where the visible label is shortened. */
  tooltip?: string;
  /** Runs when the item is chosen (the current-show Switch remembers the pick). */
  onSelect?: () => void;
}

/**
 * Folds a group into one rail item that opens a labeled panel of its pages.
 * Groups sharing an `id` fold into the same item, at the first one's position.
 */
export interface NavRailMenu {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
}

/**
 * Folds a group into one rail link that opens the item used last (Browse: Shows, Dogs, People,
 * Clubs; for an exhibitor-only account, My Shows: My Shows and My Dogs). Unlike `railMenu` there is no panel: the destination page carries the switch between
 * the group's items (`BrowseTabs`).
 */
export interface NavRailLink {
  id: 'browse' | 'my-shows';
  title: string;
  icon: React.ComponentType<{ className?: string }>;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
  railMenu?: NavRailMenu;
  railLink?: NavRailLink;
  /**
   * The current-show group: `items[0]` is the current show (the rail link); any further items are
   * the other managed shows, listed in the rail's Switch menu. The drawer lists them all.
   */
  railSwitch?: boolean;
}

export interface SidebarConfig {
  /** Navigation groups with items */
  groups: NavGroup[];
  /** The dashboard route for this role (used for exact-match active detection) */
  dashboardHref: string;
  /** User name shown in the desktop account footer */
  accountName: string;
  /** Primary role shown below the user name; additional roles are summarized */
  accountRoleLabel: string;
}
