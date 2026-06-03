import { Badge } from '@/components/ui/badge';
import React from 'react';
import type { UserWithRoles } from '@/types/auth-types';
import type { ShowTab } from '@/types/unified-shows-types';
import type { Show } from '@/types/show-types';
import type { SyncableShowEntry } from '@/store/entry-store-types';

/**
 * Utility functions for BrowseShowsPage
 * Extracted from BrowseShowsPage.tsx as part of DEBT-002 refactoring
 */

/**
 * Get status badge component based on show status
 */
export function getStatusBadge(status: string): React.ReactNode {
  switch (status) {
    case 'Upcoming':
      return React.createElement(Badge, {
        className: 'bg-success-green/10 text-success-green border-success-green/20 border'
      }, 'Upcoming');
    case 'Completed':
      return React.createElement(Badge, {
        className: 'bg-muted/10 text-muted-foreground border-muted/20 border'
      }, 'Completed');
    default:
      return React.createElement(Badge, {
        className: 'bg-muted text-muted-foreground border-border border'
      }, status);
  }
}

/**
 * Color mapping for show type badges
 */
const TYPE_BADGE_COLORS: Record<string, string> = {
  'Agility': 'bg-primary/10 text-primary border-primary/20',
  'Scent Work': 'bg-success-green/10 text-success-green border-success-green/20',
  'Rally': 'bg-[#5856D6]/10 text-[#5856D6] border-[#5856D6]/20',
  'Obedience': 'bg-warning-orange/10 text-warning-orange border-warning-orange/20',
  'Nosework': 'bg-success-green/10 text-success-green border-success-green/20'
};

/**
 * Get type badge component based on show type
 */
export function getTypeBadge(type: string): React.ReactNode {
  const colorClass = TYPE_BADGE_COLORS[type] || 'bg-muted/10 text-muted-foreground border-muted/20';
  return React.createElement(Badge, {
    className: `${colorClass} border`
  }, type.toUpperCase());
}

/**
 * Icon mapping for show actions
 * Maps icon names to their component imports
 */
export const ACTION_ICON_MAP = {
  Eye: 'Eye',
  UserPlus: 'UserPlus',
  Edit: 'Edit',
  Trophy: 'Trophy',
  Download: 'Download',
  Award: 'Award',
  Printer: 'Printer',
  Settings: 'Settings',
  Users: 'Users',
  FileText: 'FileText',
  List: 'List',
  ClipboardList: 'ClipboardList',
  Edit3: 'Edit3',
  FileOutput: 'FileOutput',
  Plus: 'Plus'
} as const;

/**
 * Discipline label mapping
 */
export const DISCIPLINE_LABELS: Record<string, string> = {
  'scent_work': 'Scent Work',
  'agility': 'Agility',
  'rally': 'Rally',
  'obedience': 'Obedience'
};

/**
 * Entry status label mapping
 */
export const ENTRY_STATUS_LABELS: Record<string, string> = {
  'closing_soon': 'Closing Soon',
  'open': 'Open',
  'closed': 'Closed',
  'waitlist': 'Waitlist'
};

/**
 * Location filter label mapping
 */
export const LOCATION_LABELS: Record<string, string> = {
  'local': 'Within 50 miles',
  'regional': 'Within 200 miles',
  'online': 'Online Only'
};

/**
 * Date range label mapping
 */
export const DATE_RANGE_LABELS: Record<string, string> = {
  'this_month': 'This Month',
  'next_month': 'Next Month'
};

export function getBrowseShowsCountUserId(
  user: UserWithRoles | null | undefined
): string | undefined {
  return user?.databaseUserId ?? user?.id;
}

interface BrowseShowsTabCountInput {
  tab: ShowTab | undefined;
  selectedTab: string;
  selectedTabCount: number;
  shows: Show[];
  entries: SyncableShowEntry[];
  userId: string | undefined;
}

export function getBrowseShowsTabCount({
  tab,
  selectedTab,
  selectedTabCount,
  shows,
  entries,
  userId,
}: BrowseShowsTabCountInput): number | undefined {
  if (!tab?.getCount) return undefined;
  if (tab.id === selectedTab) return selectedTabCount;
  return tab.getCount(shows, entries, userId);
}
