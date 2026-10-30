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
import { isPulledEntry } from '@/features/_shared/entryAccounting';
import type { ReplicatedEntry } from '@/services/replication';
import { UserRole } from '@/types/auth-types';
import { isTrialDayToday } from '@/pages/MyEntriesPage/modules/dayCheckIn';
import { parseShowDate } from '@/pages/MyEntriesPage/modules/myEntriesStats.helpers';
import type { SelfCheckinState } from '@/hooks/queries/useSelfCheckinEnabled';
import type { RunQueueState } from '@myk9/ringside/run-queue';
import { withServerPlace } from '@/utils/showEntryRunQueue';
import { deriveResultReleaseDisplay } from '@/features/result-card/resultReleaseDisplay';

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
  /** The class's raw `start_time` (ISO instant or clock string), for ordering only. */
  startTime?: string | undefined;
  /** The class's `class_order`, the secretary's own sequence, for ordering ties. */
  classOrder?: number | undefined;
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

/** One own entry's result as the exhibitor's masked read returned it (MYK9-1026). */
export interface OwnShowResult {
  isScored: boolean;
  resultStatus: string | null;
  searchTimeSeconds: number | null;
  totalFaults: number | null;
  /** Null until the class is released; the masked read withholds it before. */
  finalPlacement: number | null;
  resultsReleasedAt: string | null;
  /**
   * True only when the server's masked view answered. The offline fallback nulls the
   * same result columns, so a null status from it says nothing about release (MYK9-1519).
   */
  serverConfirmed?: boolean | undefined;
}

export const NO_OWN_RESULTS: ReadonlyMap<string, OwnShowResult> = new Map();

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
  /** The exhibitor's own masked result (MYK9-1026). Null when withheld or not scored. */
  resultStatus: string | null;
  resultTimeSeconds: number | null;
  /** Fault count; the row shows it on a Q above zero (the #2879 rule). Null when withheld. */
  resultFaults: number | null;
  /** True while the class is unreleased: the row labels the result "preliminary". */
  isPreliminary: boolean;
  /** Scored, but the release preset withholds the result: the row says it is not released (MYK9-1519). */
  isResultWithheld?: boolean | undefined;
  /** The class's resolved self-check-in cascade (MYK9-800 follow-up). */
  selfCheckinState: SelfCheckinState;
  /** "<trial label> · <date>" (`formatAtShowTrialHeading`), or null before the trial replica resolves. */
  trialLabel: string | null;
  /** The class's status, so a notice can tell a running class from a waiting one. */
  classStatus?: string | undefined;
  /** The class's `class_order`; breaks ties between classes with equal or unknown starts. */
  classOrder?: number | undefined;
  /** The dog's id, so two dogs sharing a call name stay two dogs. Falls back to the name. */
  dogKey?: string | undefined;
  /** The stored run order, for the run-queue tie-break (never displayed). */
  runOrder?: number | null | undefined;
  /** The class's raw start time, parsed for ordering by `orderMyEntriesToday`. */
  startTime?: string | null | undefined;
  /** The trial's IANA zone, for reading a start instant and a freshness time on its clock. */
  trialTimezone?: string | null | undefined;
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
  resultsByEntryId: ReadonlyMap<string, OwnShowResult> = NO_OWN_RESULTS,
  now: Date = new Date()
): AtShowEntryDetail[] {
  const details: AtShowEntryDetail[] = [];

  for (const entry of entries) {
    if (!ownEntryIds.has(entry.id)) continue;

    const trialId = entry.trialId ?? entry.trial_id;
    const trial = trialId ? (trialsById.get(trialId) ?? null) : null;
    if (trial && !isTrialDayToday(parseShowDate(trial.date), trial.timezone, now)) continue;

    const classSummary = entry.classId ? (classesById.get(entry.classId) ?? null) : null;
    // INTENT: the result comes ONLY from the exhibitor's own masked read
    // (`getUserEntries`), never from this show replica. Sign-out does not wipe
    // the replica, so a staff session on the same device can leave unmasked
    // scores here that a preset or privacy setting withholds from exhibitors.
    // An unreleased result is shown labelled preliminary, as My Entries, the
    // dog page and the show page do (owner decision, MYK9-1026).
    const own = resultsByEntryId.get(entry.id);
    const status = own?.resultStatus ?? null;
    // A pull outranks a result recorded before it (MYK9-1258).
    const pulled = isPulledEntry(entry);
    const hasVisibleResult =
      !pulled && own?.isScored === true && status != null && status !== 'pending';
    // The masked read passes `is_scored` through but nulls the qualification
    // when the preset withholds it, so scored-with-no-status is "withheld" —
    // but only when the server said so, not the offline fallback.
    const isResultWithheld =
      !pulled && own?.serverConfirmed === true && own.isScored === true && status == null;
    const seconds = own?.searchTimeSeconds;
    const { isPreliminary } = deriveResultReleaseDisplay({
      // The own read is authoritative: a stale class replica must never turn
      // an unreleased result final.
      resultsReleasedAt: own?.resultsReleasedAt ?? null,
      resultStatus: status,
      finalPlacement: null,
    });

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
      isScored: (entry.isScored ?? false) && !pulled,
      resultStatus: hasVisibleResult ? status : null,
      resultTimeSeconds:
        hasVisibleResult && typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0
          ? seconds
          : null,
      resultFaults: hasVisibleResult ? (own?.totalFaults ?? null) : null,
      isPreliminary: hasVisibleResult && isPreliminary,
      isResultWithheld,
      selfCheckinState: classSummary?.selfCheckinState ?? 'unknown',
      trialLabel: trial?.label ?? null,
      dogKey: entry.dogId ?? entry.dogCallName ?? entry.id,
      runOrder: entry.runOrder ?? null,
      startTime: classSummary?.startTime ?? null,
      classStatus: classSummary?.classStatus,
      classOrder: classSummary?.classOrder,
      trialTimezone: trial?.timezone ?? null,
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
