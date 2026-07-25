/**
 * Pure derivation for the exhibitor "Your dogs today" show-day view.
 *
 * Sourced entirely from already-replicated rows (offline-first show-day
 * constraint — see `openspec/changes/exhibitor-elderly-ux-remediation`):
 * `ReplicatedEntry` for per-entry dog/armband/check-in state, and the class
 * summary (`class_name`/`class_status`) already fetched by
 * `useAtShowClassList` for the class-picker view. No direct Supabase reads.
 *
 * @module at-show/myAtShowEntryDetails.helpers
 */
import type { CheckInStatus } from '@myk9/core';
import type { ReplicatedEntry } from '@/services/replication';
import { UserRole } from '@/types/auth-types';

const STAFF_ROLES: readonly UserRole[] = [
  UserRole.SITE_ADMIN,
  UserRole.SECRETARY,
  UserRole.JUDGE,
  UserRole.CLUB_ADMIN,
  UserRole.CHAIRMAN,
  UserRole.STEWARD,
];

/**
 * True when an account is exhibitor-only for show-day purposes — has the
 * exhibitor role and none of the staff roles that use ringside class
 * administration. Staff accounts (including a secretary who also exhibits)
 * keep the class-first default; see the design's "Exhibitor show day starts
 * from owned entries, not ringside class administration" decision.
 */
export function isExhibitorOnlyForAtShow(hasRole: (role: UserRole) => boolean): boolean {
  return hasRole(UserRole.EXHIBITOR) && !STAFF_ROLES.some(role => hasRole(role));
}

export interface AtShowClassSummary {
  className: string;
  classStatus: string;
  expectedStartLabel?: string | undefined;
  isRevisedStart?: boolean | undefined;
}

export interface AtShowEntryDetail {
  entryId: string;
  classId: string | null;
  dogName: string;
  armband: string | null;
  checkInStatus: CheckInStatus;
  /** Null when the class isn't in today's replicated class list yet. */
  className: string | null;
  expectedStartLabel: string | null;
  isRevisedStart: boolean;
  /** Whether the exhibitor's row has a run-order position assigned. */
  hasRunOrder: boolean;
  isScored: boolean;
}

export type AtShowEntryNextAction =
  | { kind: 'check-in' }
  | { kind: 'wait-running-order' }
  | { kind: 'view-class' }
  | { kind: 'scored' };

/**
 * Build the exhibitor's "today" entry list for one show from the entries the
 * account owns (already resolved by `useMyAtShowEntries`) plus the class
 * summaries the class-picker view already has in memory.
 */
export function buildMyAtShowEntryDetails(
  entries: ReplicatedEntry[],
  ownEntryIds: ReadonlySet<string>,
  classesById: ReadonlyMap<string, AtShowClassSummary>
): AtShowEntryDetail[] {
  const details: AtShowEntryDetail[] = [];

  for (const entry of entries) {
    if (!ownEntryIds.has(entry.id)) continue;

    const classSummary = entry.classId ? (classesById.get(entry.classId) ?? null) : null;

    details.push({
      entryId: entry.id,
      classId: entry.classId ?? null,
      dogName: entry.dogCallName ?? 'Your dog',
      armband: entry.armband ?? null,
      checkInStatus: entry.checkInStatus ?? 'no-status',
      className: classSummary?.className ?? null,
      expectedStartLabel: classSummary?.expectedStartLabel ?? null,
      isRevisedStart: classSummary?.isRevisedStart ?? false,
      hasRunOrder: entry.runOrder != null,
      isScored: entry.isScored ?? false,
    });
  }

  return details;
}

/**
 * The single primary next action for an entry row. Precedence: already
 * scored (nothing to do) > checked in already (nothing to do) > running
 * order not posted yet (don't invite a check-in tap that has nowhere to go)
 * > check in.
 */
export function deriveAtShowNextAction(detail: AtShowEntryDetail): AtShowEntryNextAction {
  if (detail.isScored) return { kind: 'scored' };
  if (detail.checkInStatus !== 'no-status') return { kind: 'view-class' };
  if (!detail.classId || !detail.className || !detail.hasRunOrder) {
    return { kind: 'wait-running-order' };
  }
  return { kind: 'check-in' };
}
