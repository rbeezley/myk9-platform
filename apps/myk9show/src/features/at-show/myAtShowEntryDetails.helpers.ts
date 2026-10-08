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
import { isTrialDayToday } from '@/pages/MyEntriesPage/modules/dayCheckIn';
import { parseShowDate } from '@/pages/MyEntriesPage/modules/myEntriesStats.helpers';
import type { SelfCheckinState } from '@/hooks/queries/useSelfCheckinEnabled';
import type { RunQueueState } from '@myk9/ringside/run-queue';
import { withServerPlace } from '@/utils/showEntryRunQueue';

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
  resultsReleasedAt?: string | null | undefined;
  expectedStartLabel?: string | undefined;
  isRevisedStart?: boolean | undefined;
  /**
   * The class/trial/show self-check-in cascade already resolved by the
   * caller (`useSelfCheckinStateMap`). Missing/undefined is treated as
   * 'unknown' — a class the map hasn't answered for yet (still loading, or
   * the read failed, including offline) must never expose Check In as if it
   * were known-allowed (MYK9-800 follow-up).
   */
  selfCheckinState?: SelfCheckinState | undefined;
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
  /** Server-exposed result, shown only once this class is released. Null when withheld. */
  resultStatus: string | null;
  resultTimeSeconds: number | null;
  /** The class's resolved self-check-in cascade (MYK9-800 follow-up). */
  selfCheckinState: SelfCheckinState;
  /** "<trial label> · <date>" (`formatAtShowTrialHeading`), or null before the trial replica resolves. */
  trialLabel: string | null;
}

export type AtShowEntryNextAction =
  | { kind: 'check-in' }
  | { kind: 'wait-running-order' }
  | { kind: 'view-class' }
  | { kind: 'scored' }
  | { kind: 'self-checkin-disabled' }
  | { kind: 'self-checkin-unknown' };

/** A trial's own calendar day + timezone, keyed by trial id (from `useAtShowClassList`'s groups). */
export interface AtShowTrialSummary {
  date: string;
  timezone: string;
  /** `formatAtShowTrialHeading`'s output for this trial — the same "<trial label> · <date>" string the class-picker's trial section headers already render (MYK9-704: reuse the existing label, never a fresh concatenation). */
  label?: string | undefined;
}

/**
 * Build the exhibitor's "today" entry list for one show from the entries the
 * account owns (already resolved by `useMyAtShowEntries`) plus the class
 * summaries the class-picker view already has in memory.
 *
 * A multi-day show has one trial per day, and an exhibitor's entries span
 * every day of the show — so this filters to the entries whose OWN trial's
 * calendar day is today, in that trial's timezone (never the device's or
 * UTC's), reusing the same rule My Shows' day check-in gate uses
 * (`isTrialDayToday`). When a trial can't be resolved yet (`trialsById` has
 * no row — the class/trial replica hasn't hydrated), the entry is kept: it's
 * indistinguishable from every other day and dropping it would hide a valid
 * entry rather than a wrong one, and `hasRunOrder`/`className` still gate
 * check-in normally in that case (MYK9-800).
 */
export function buildMyAtShowEntryDetails(
  entries: ReplicatedEntry[],
  ownEntryIds: ReadonlySet<string>,
  classesById: ReadonlyMap<string, AtShowClassSummary>,
  trialsById: ReadonlyMap<string, AtShowTrialSummary>,
  now: Date = new Date()
): AtShowEntryDetail[] {
  const details: AtShowEntryDetail[] = [];

  for (const entry of entries) {
    if (!ownEntryIds.has(entry.id)) continue;

    const trialId = entry.trialId ?? entry.trial_id;
    const trial = trialId ? (trialsById.get(trialId) ?? null) : null;
    if (trial && !isTrialDayToday(parseShowDate(trial.date), trial.timezone, now)) continue;

    const classSummary = entry.classId ? (classesById.get(entry.classId) ?? null) : null;
    // The replication view already masks qualification/time by visibility and
    // privacy. Require the class release too: an old staff-populated cache must
    // never turn a preliminary result into a final exhibitor result.
    const status = entry.resultStatus ?? entry.result_status;
    const hasVisibleResult =
      Boolean(classSummary?.resultsReleasedAt) &&
      (entry.isScored ?? entry.is_scored) === true &&
      status != null &&
      status !== 'pending';
    const seconds = entry.searchTimeSeconds ?? entry.search_time_seconds;

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
      resultStatus: hasVisibleResult ? status : null,
      resultTimeSeconds:
        hasVisibleResult && typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0
          ? seconds
          : null,
      selfCheckinState: classSummary?.selfCheckinState ?? 'unknown',
      trialLabel: trial?.label ?? null,
    });
  }

  return details;
}

/**
 * The single primary next action for an entry row. Precedence: already
 * scored (nothing to do) > checked in already (nothing to do) > running
 * order not posted yet (don't invite a check-in tap that has nowhere to go)
 * > self-check-in not resolved as allowed for this class (don't offer a tap
 * the `self_checkin_entry` RPC will refuse — MYK9-800 follow-up; this
 * includes 'unknown', since an unresolved cascade is exactly as unsafe to
 * act on as a known-off one) > check in.
 */
export function deriveAtShowNextAction(detail: AtShowEntryDetail): AtShowEntryNextAction {
  if (detail.isScored) return { kind: 'scored' };
  if (detail.checkInStatus !== 'no-status') return { kind: 'view-class' };
  if (!detail.classId || !detail.className || !detail.hasRunOrder) {
    return { kind: 'wait-running-order' };
  }
  if (detail.selfCheckinState === 'unknown') {
    return { kind: 'self-checkin-unknown' };
  }
  if (detail.selfCheckinState === 'not-allowed') {
    return { kind: 'self-checkin-disabled' };
  }
  return { kind: 'check-in' };
}

/** Check-in states that already say where a dog is; a place in line adds nothing (MYK9-992). */
const NO_PLACE_STATUSES: ReadonlySet<CheckInStatus> = new Set([
  'no-status',
  'in-ring',
  'pulled',
  'completed',
]);

/**
 * True when this dog is waiting to run and its place in line is a fair thing
 * to ask the server for: checked in (or at the gate), not yet scored, with an
 * order posted. Finished, in-ring and pulled dogs are state-only.
 */
export function isAwaitingPlaceInLine(detail: AtShowEntryDetail): boolean {
  return !detail.isScored && !NO_PLACE_STATUSES.has(detail.checkInStatus) && detail.hasRunOrder;
}

/**
 * What a checked-in, unscored dog says about its place in line (MYK9-992):
 * the server's count when known (`places`, from `useMyEntryQueuePlaces`),
 * "Waiting" when an order is posted but the count is unavailable (offline,
 * loading), and 'pending' when no running order is posted. Null for every
 * dog whose state is already shown elsewhere on the row.
 */
export function deriveAtShowQueueLine(
  detail: AtShowEntryDetail,
  place: number | undefined
): RunQueueState | { kind: 'pending' } | null {
  if (detail.isScored || NO_PLACE_STATUSES.has(detail.checkInStatus)) return null;
  if (!detail.hasRunOrder) return { kind: 'pending' };
  return withServerPlace({ kind: 'waiting-unknown' }, place);
}
