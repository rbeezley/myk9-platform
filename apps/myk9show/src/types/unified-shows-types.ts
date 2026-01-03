import { UserRole, Permission } from './auth-types';
import { Show } from './show-types';
import { SyncableShowEntry } from '@/store/entryStore';

/**
 * Tab configuration for the unified shows interface
 */
export interface ShowTab {
  id: string;
  label: string;
  description?: string;
  requiredRoles?: UserRole[];
  requiredPermissions?: Permission[];
  getCount?: (shows: Show[], entries: SyncableShowEntry[], userId?: string) => number;
  filterShows?: (shows: Show[], entries: SyncableShowEntry[], userId?: string) => Show[];
}

/**
 * Show relationship types for filtering
 */
export type ShowRelationship = 
  | 'all'           // All available shows
  | 'past'          // Historical shows
  | 'entries'       // Shows user has entered
  | 'managing'      // Shows user is secretary/admin for
  | 'assignments'   // Shows user is judging

/**
 * Tab-specific actions available to users
 */
export interface TabAction {
  id: string;
  label: string;
  icon?: string;
  variant?: 'default' | 'outline' | 'ghost' | 'destructive';
  requiredPermissions?: Permission[];
  onClick: (showId: string) => void;
}

/**
 * Configuration for a complete tab system
 */
export interface TabConfiguration {
  tabs: ShowTab[];
  defaultTab: string;
  actions: Record<string, TabAction[]>; // Actions by tab ID
}

/**
 * User context for determining available tabs and actions
 */
export interface UserShowContext {
  userId: string;
  roles: UserRole[];
  permissions: Permission[];
  managedShows: string[];     // Show IDs user manages
  judgeAssignments: string[]; // Show IDs user is judging
  entries: string[];          // Show IDs user has entered
}

/**
 * Helper type for tab filtering functions
 */
export type TabFilter = (shows: Show[], context: UserShowContext) => Show[];

/**
 * Enhanced show with relationship metadata
 */
export interface ShowWithRelationship extends Show {
  relationship: ShowRelationship[];
  userCanManage: boolean;
  userIsJudging: boolean;
  userHasEntries: boolean;
}