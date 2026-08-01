/**
 * Shared types and constants for UserTable components
 */

import React from 'react';
import { UserIcon, Crown, CheckCircle2, Edit, Settings } from 'lucide-react';
import { UserRole as UserRoleType } from '@/types/auth-types';

// Sort & display types
export type SortField = 'name' | 'email' | 'role' | 'lastLogin' | 'created';
export type SortDirection = 'asc' | 'desc';
export type DensityMode = 'compact' | 'comfortable' | 'spacious';

// Re-export for convenience within the module
export type { UserRoleType };

// Props for the top-level UserTable component
export interface UserTableProps {
  users: import('@/hooks/queries/useUsersQuery').AdminUser[];
  isLoading: boolean;
  selectedUsers: import('@/pages/admin/UserManagementPage').SelectedUser[];
  onSelectUser: (user: import('@/types/user-types').User, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  onUserClick: (user: import('@/types/user-types').User) => void;
  onManageRoles?: (user: import('@/types/user-types').User) => void;
  currentPage: number;
  totalPages: number;
  totalFilteredUsers: number;
  onPageChange: (page: number) => void;
  pageSize: number;
  onPageSizeChange?: (size: number) => void;
  searchTerm?: string;
  densityMode?: DensityMode;
  /**
   * Sorting is owned by the page, not the table: the table only ever holds the
   * current page's rows, so sorting here would reorder 25 of 1,000 rows and
   * call it "oldest login".
   */
  sort?: import('@/pages/admin/UserManagementPage.types').UserSort | null;
  onSortChange?: (sort: import('@/pages/admin/UserManagementPage.types').UserSort | null) => void;
}

// Role config entry
export interface RoleConfigEntry {
  label: string;
  /**
   * A `--chip-*` background/foreground pair. Each pair ships a light and a dark
   * value, so a chip stays legible in both themes — the inline Apple hexes this
   * replaced rendered at 2.0-3.6:1 in light mode and inverted in dark.
   */
  chipClass: string;
  icon?: React.ComponentType<{ className?: string }>;
}

const chip = (hue: string) => `bg-[color:var(--chip-${hue}-bg)] text-[color:var(--chip-${hue}-fg)]`;

// One chip hue per role, so a role is recognisable at a glance without the
// colour carrying meaning on its own (the label always states the role).
export const ROLE_CONFIG: Record<UserRoleType, RoleConfigEntry> = {
  exhibitor: {
    label: 'Exhibitor',
    chipClass: chip('blue'),
    icon: UserIcon,
  },
  judge: {
    label: 'Judge',
    chipClass: chip('teal'),
    icon: CheckCircle2,
  },
  secretary: {
    label: 'Secretary',
    chipClass: chip('amber'),
    icon: Edit,
  },
  steward: {
    label: 'Steward',
    chipClass: chip('stone'),
    icon: Settings,
  },
  chairman: {
    label: 'Chairman',
    chipClass: chip('purple'),
    icon: Crown,
  },
  club_admin: {
    label: 'Club Admin',
    chipClass: chip('green'),
    icon: Settings,
  },
  site_admin: {
    label: 'Site Admin',
    chipClass: chip('red'),
    icon: Settings,
  },
};

/** Fallback for a role the config doesn't know about. */
export const UNKNOWN_ROLE_CHIP = chip('stone');

// Density mode configurations
export interface DensityConfig {
  rowHeight: string;
  avatarSize: string;
  fontSize: string;
  padding: string;
  spacing: string;
}

export const DENSITY_CONFIG: Record<DensityMode, DensityConfig> = {
  compact: {
    rowHeight: 'h-12',
    avatarSize: 'h-8 w-8',
    fontSize: 'text-sm',
    padding: 'p-2',
    spacing: 'gap-2',
  },
  comfortable: {
    rowHeight: 'h-16',
    avatarSize: 'h-10 w-10',
    fontSize: 'text-base',
    padding: 'p-4',
    spacing: 'gap-3',
  },
  spacious: {
    rowHeight: 'h-20',
    avatarSize: 'h-12 w-12',
    fontSize: 'text-lg',
    padding: 'p-6',
    spacing: 'gap-4',
  },
};

// (The former APPLE_FONT_STYLE constant forced the Apple system font stack over
// Montserrat, which DESIGN.md specifies for all working UI. Removed — the table
// inherits the app font like every other surface.)
