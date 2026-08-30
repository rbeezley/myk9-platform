import { Badge } from '@/components/ui/badge';
import React from 'react';
import { chipClasses } from '@/components/base/chipClasses';
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
        className: 'bg-success/10 text-success border-success/20 border'
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
  'Scent Work': 'bg-success/10 text-success border-success/20',
  'Rally': chipClasses('purple', { border: true }),
  'Obedience': 'bg-warning/10 text-warning border-warning/20',
  'Nosework': 'bg-success/10 text-success border-success/20'
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

/**
 * Build a minimal "entered" entry stub for a show the account-level source says
 * the user entered but the local entryStore hasn't synced yet. Only the fields
 * the entered-membership filters read (`showId`,
 * `registrationData.handler`/`handlerId`) carry meaning; the rest are inert
 * placeholders. Stamped with the caller's own user id so the existing filters
 * (`handlerId === userId`) match. See `useAccountEnteredShowIds`.
 */
function buildAccountEnteredShowStub(
  showId: string,
  userId: string,
  isActive: boolean
): SyncableShowEntry {
  const nowIso = new Date().toISOString();
  return {
    id: `account-entered:${showId}`,
    showId,
    classId: '',
    dogId: '',
    status: isActive ? 'submitted' : 'completed',
    registrationData: {
      submittedAt: nowIso,
      handler: userId,
      handlerId: userId,
      entryFee: 0,
      paymentStatus: 'pending',
    },
    statusHistory: [],
    createdAt: nowIso,
    updatedAt: nowIso,
    _version: 0,
    _lastModified: new Date(),
    _lastModifiedBy: userId,
    _syncStatus: 'synced',
    _localOnly: true,
  };
}

/**
 * Merge account-level entered show ids into the local entry list as stubs, so
 * every show the exhibitor has entered is known to the Shows page — not only
 * the ones whose entries have synced into the local per-show `entryStore`. A
 * show already represented for this user is left as-is (the real entry wins);
 * the merge is purely additive, so it can never drop an existing entry or
 * mis-count another user's shows.
 *
 * This was written for the "Entered as exhibitor" TAB, and its docblock used to
 * say so. That tab is gone (it duplicated My Shows), but this is not dead with
 * it: the merged entries also feed each show's `entries` RELATIONSHIP, which is
 * what puts View Entry / Modify on an individual show card. Without the stubs
 * those actions would disappear from any entered show whose entries have not
 * synced locally.
 */
export function mergeAccountEnteredShowStubs(
  entries: SyncableShowEntry[],
  accountEnteredShowIds: string[],
  userId: string | undefined,
  activeEnteredShowIds: readonly string[] = accountEnteredShowIds
): SyncableShowEntry[] {
  if (!userId || accountEnteredShowIds.length === 0) return entries;

  const alreadyEntered = new Set(
    entries
      .filter(
        e =>
          e.registrationData.handler === userId || e.registrationData.handlerId === userId
      )
      .map(e => e.showId)
  );

  const activeShowIds = new Set(activeEnteredShowIds);
  const stubs = accountEnteredShowIds
    .filter(showId => !alreadyEntered.has(showId))
    .map(showId => buildAccountEnteredShowStub(showId, userId, activeShowIds.has(showId)));

  return stubs.length > 0 ? [...entries, ...stubs] : entries;
}

interface BrowseShowsTabCountInput {
  tab: ShowTab | undefined;
  shows: Show[];
  entries: SyncableShowEntry[];
  userId: string | undefined;
}

export function getBrowseShowsTabCount({
  tab,
  shows,
  entries,
  userId,
}: BrowseShowsTabCountInput): number | undefined {
  if (!tab?.getCount) return undefined;
  return tab.getCount(shows, entries, userId);
}
