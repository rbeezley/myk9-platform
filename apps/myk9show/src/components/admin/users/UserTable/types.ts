/**
 * Shared types and constants for UserTable components
 */

import React from 'react';
import {
  UserIcon,
  Shield,
  CheckCircle2,
  Edit,
  Settings,
} from 'lucide-react';
import { UserRole as UserRoleType } from '@/types/auth-types';

// Sort & display types
export type SortField = 'name' | 'email' | 'role' | 'lastLogin' | 'created';
export type SortDirection = 'asc' | 'desc';
export type DensityMode = 'compact' | 'comfortable' | 'spacious';

// Re-export for convenience within the module
export type { UserRoleType };

// Props for the top-level UserTable component
export interface UserTableProps {
  users: import('@/types/user-types').User[];
  isLoading: boolean;
  selectedUsers: import('@/pages/admin/UserManagementPage').SelectedUser[];
  onSelectUser: (user: import('@/types/user-types').User, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  onUserClick: (user: import('@/types/user-types').User) => void;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  pageSize: number;
  searchTerm?: string;
  densityMode?: DensityMode;
}

// Role config entry
export interface RoleConfigEntry {
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  color: string;
  background: string;
  icon?: React.ComponentType<{ className?: string }>;
}

// Enhanced role configuration with Premium styling
export const ROLE_CONFIG: Record<UserRoleType, RoleConfigEntry> = {
  exhibitor: {
    label: 'Exhibitor',
    variant: 'default',
    color: '#007AFF',
    background: 'rgba(0, 122, 255, 0.1)',
    icon: UserIcon,
  },
  handler: {
    label: 'Handler',
    variant: 'secondary',
    color: '#34C759',
    background: 'rgba(52, 199, 89, 0.1)',
    icon: Shield,
  },
  judge: {
    label: 'Judge',
    variant: 'outline',
    color: '#5856D6',
    background: 'rgba(88, 86, 214, 0.1)',
    icon: CheckCircle2,
  },
  secretary: {
    label: 'Secretary',
    variant: 'secondary',
    color: '#FF9500',
    background: 'rgba(255, 149, 0, 0.1)',
    icon: Edit,
  },
  steward: {
    label: 'Steward',
    variant: 'outline',
    color: '#8E8E93',
    background: 'rgba(142, 142, 147, 0.1)',
    icon: Settings,
  },
  gate_steward: {
    label: 'Gate Steward',
    variant: 'outline',
    color: '#8E8E93',
    background: 'rgba(142, 142, 147, 0.1)',
    icon: UserIcon,
  },
  club_admin: {
    label: 'Club Admin',
    variant: 'secondary',
    color: '#FF9500',
    background: 'rgba(255, 149, 0, 0.1)',
    icon: Settings,
  },
  site_admin: {
    label: 'Site Admin',
    variant: 'destructive',
    color: '#FF3B30',
    background: 'rgba(255, 59, 48, 0.1)',
    icon: Settings,
  },
  admin: {
    label: 'Admin',
    variant: 'destructive',
    color: '#FF3B30',
    background: 'rgba(255, 59, 48, 0.1)',
    icon: Shield,
  },
};

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

// System font style (shared across components)
export const APPLE_FONT_STYLE = {
  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif',
} as const;
