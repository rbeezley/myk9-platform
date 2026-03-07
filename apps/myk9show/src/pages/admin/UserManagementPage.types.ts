/**
 * Types for UserManagementPage and related components.
 */

import type { UserRole as UserRoleType } from '@/types/user-types';
import type { User } from '@/types/user-types';

export interface UserFilter {
  search: string;
  role: UserRoleType | 'all';
  status: 'active' | 'inactive' | 'suspended' | 'all';
  clubAffiliation: string;
  dateRange: {
    start: Date | null;
    end: Date | null;
  };
}

export interface SelectedUser {
  id: string;
  user: User;
}

export const DEFAULT_USER_FILTER: UserFilter = {
  search: '',
  role: 'all',
  status: 'all',
  clubAffiliation: '',
  dateRange: { start: null, end: null },
};
