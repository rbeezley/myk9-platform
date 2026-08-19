/**
 * Show-eve offline-priming nudge (MYK9-203, PR 2).
 *
 * The evening before a trial day, remind the people who will RUN that day to
 * open the show while they still have internet, so the device carries it to a
 * venue that may not. Deno-free so it can be unit tested with vitest.
 */

/** Club-scoped staff row. Staff roles in this repo are club-scoped, never show-scoped. */
export interface ShowEveClubStaffRow {
  auth_user_id: string | null;
  role_name: string;
  /** person id — used to check club membership; absent in older call shapes. */
  user_id?: string | null;
  /** Set for show-scoped official rows, which are membership-exempt. */
  show_id?: string | null;
}

/** A judge assigned to this show, resolved to their auth account. */
export interface ShowEveJudgeRow {
  auth_user_id: string | null;
  status: string | null;
}

/**
 * How long a claim may sit undelivered before another run may take it over.
 *
 * Sits between two hard bounds, with margin on both sides:
 *   - ABOVE the worst-case send (10 subscriptions x 8s = 80s), so a healthy
 *     in-flight run is never robbed of a claim it is still working.
 *   - BELOW the SMALLEST gap between cron runs (the :45 -> :55 pair, 10 min),
 *     so every run can reclaim what its predecessor abandoned. A lease equal
 *     to that gap would sit exactly on the boundary of this strict `>` and
 *     leave the last run of the window unable to rescue the one before it.
 */
export const CLAIM_LEASE_MS = 5 * 60 * 1000;

export interface ShowEveClaimRow {
  claimed_at: string;
  delivered_at: string | null;
}

/**
 * A claim exists but the notification may never have been sent — the run could
 * have crashed between claiming and delivering. Without this, the unique
 * constraint would read as "already sent" forever and that person would
 * silently never be nudged again.
 */
export function shouldReclaimStaleClaim(row: ShowEveClaimRow, now: number): boolean {
  if (row.delivered_at) return false;
  const claimedAt = Date.parse(row.claimed_at);
  // An unreadable timestamp must not permanently suppress a nudge; retrying
  // risks at worst one duplicate, while skipping risks silence forever.
  if (Number.isNaN(claimedAt)) return true;
  return now - claimedAt > CLAIM_LEASE_MS;
}

/**
 * A show can span several days. A judge assigned to Saturday should not be
 * nudged the night before Sunday; a show-level assignment (no trial) covers
 * every day.
 */
export function isJudgeAssignedToTrial(
  assignment: {
    trial_id: string | null;
    class_id?: string | null;
    /** trial_id of the assigned class, resolved via the classes embed. */
    class_trial_id?: string | null;
    /** Set when the assigned class was soft-deleted — the work is gone. */
    class_deleted_at?: string | null;
  },
  trialId: string
): boolean {
  if (assignment.trial_id !== null) return assignment.trial_id === trialId;

  // A CLASS-level assignment also stores trial_id as null
  // (ReplicatedJudgeAssignmentsTable.replaceClassAssignment writes
  // `trialId: null`), so a null alone does not mean show-wide — the class
  // decides the day.
  if (assignment.class_id) {
    // soft_delete_class leaves the assignment row behind; the judge is not
    // working a class that no longer exists.
    if (assignment.class_deleted_at) return false;
    if (!assignment.class_trial_id) {
      // Unresolvable class (missing embed) is a data anomaly. Prefer one extra
      // reminder for someone on this show over silence for someone working it.
      return true;
    }
    return assignment.class_trial_id === trialId;
  }

  // No trial and no class: a genuine show-level assignment covers every day.
  return true;
}

/**
 * Whether a trial's show is in a state worth announcing.
 *
 * Deliberately evaluated in TypeScript rather than as PostgREST embedded
 * filters: those must name the SELECT alias (`show`, not `shows`), and `neq`
 * compiles to `<>` which never matches NULL — two silent ways to either drop
 * every trial or announce a cancelled one. A plain predicate is testable.
 */
export function isTrialNudgeable(trial: {
  show: { status?: string | null; deleted_at?: string | null } | null;
}): boolean {
  const show = trial.show;
  if (!show) return false;
  if (show.deleted_at) return false;
  // A NULL status is "unset", not "cancelled".
  return show.status !== 'cancelled';
}

/**
 * Honour the persisted push opt-out. `notification_preferences.push_enabled`
 * exists so server-side senders suppress delivery; only an explicit `false`
 * opts out, since the column defaults to true and a user with no row at all
 * has never opted out of anything.
 */
export function filterPushOptedIn(
  recipients: string[],
  preferences: Array<{ auth_user_id: string | null; push_enabled: boolean | null }>
): string[] {
  const optedOut = new Set(
    preferences.filter(p => p.push_enabled === false).map(p => p.auth_user_id)
  );
  return recipients.filter(id => !optedOut.has(id));
}

/**
 * The notification is about a SHOW ("<Show> starts tomorrow"), so a show with
 * two trials on the same date must produce ONE push per person, not one per
 * trial. Grouping here makes the ledger key (show, date, recipient) match what
 * the recipient actually experiences.
 */
export interface ShowEveTrialGroup {
  showId: string;
  showName: string;
  trialDate: string;
  trialIds: string[];
}

export function groupTrialsByShow(
  trials: Array<{
    id: string;
    date: string;
    show_id: string;
    show: { name?: string | null } | null;
  }>
): ShowEveTrialGroup[] {
  const groups = new Map<string, ShowEveTrialGroup>();
  for (const trial of trials) {
    const key = `${trial.show_id}|${trial.date}`;
    const existing = groups.get(key);
    if (existing) {
      existing.trialIds.push(trial.id);
      continue;
    }
    groups.set(key, {
      showId: trial.show_id,
      showName: trial.show?.name ?? 'Your show',
      trialDate: trial.date,
      trialIds: [trial.id],
    });
  }
  return [...groups.values()];
}

/**
 * Club-scoped roles additionally require an ACTIVE club membership
 * (20260802120000_enforce_club_membership_role_boundaries.sql), so a suspended
 * or removed member with a lingering role row is not show staff. Show-scoped
 * officials are explicitly exempt by that same migration.
 */
export function filterClubStaffByMembership<
  T extends { user_id: string | null; show_id: string | null },
>(rows: T[], activeMemberPersonIds: Set<string>): T[] {
  return rows.filter(row => {
    if (row.show_id) return true;
    return row.user_id !== null && activeMemberPersonIds.has(row.user_id);
  });
}

export interface ShowEveNudgePayload {
  title: string;
  body: string;
  /** Becomes the service worker's notification tag (see sw-custom.ts). */
  type: string;
  /** `actionUrl` is the field swClickNavigation reads; `url` is ignored. */
  data: { actionUrl: string };
}

/**
 * Roles that operate a show day. Exhibitors are excluded (they attend, they do
 * not run rings) and so are site admins (platform staff, not show staff).
 */
/**
 * Club-role holders who run a show day. `judge` is deliberately ABSENT: a club
 * judge is only working a given show if `judge_assignments` says so, and the
 * assignment path already carries them. Including the role here would nudge
 * every judge in the club about a show they are not judging.
 */
const SHOW_DAY_STAFF_ROLES = new Set(['secretary', 'club_admin', 'chairman', 'steward']);

/** Assignment states that mean the judge is actually expected at the show. */
const ACTIVE_ASSIGNMENT_STATUSES = new Set(['confirmed', 'invited', 'accepted', 'pending']);

export function selectShowEveRecipients({
  clubStaff,
  judges,
}: {
  clubStaff: ShowEveClubStaffRow[];
  judges: ShowEveJudgeRow[];
}): string[] {
  const recipients = new Set<string>();

  for (const row of clubStaff) {
    if (!row.auth_user_id) continue;
    if (!SHOW_DAY_STAFF_ROLES.has(row.role_name)) continue;
    recipients.add(row.auth_user_id);
  }

  for (const row of judges) {
    if (!row.auth_user_id) continue;
    if (!ACTIVE_ASSIGNMENT_STATUSES.has(row.status ?? '')) continue;
    recipients.add(row.auth_user_id);
  }

  return [...recipients];
}

export function buildShowEveNudgePayload({
  showName,
  showId,
}: {
  showName: string;
  showId: string;
  /** Present for caller clarity/logging; the copy deliberately says "tomorrow". */
  trialDate?: string;
}): ShowEveNudgePayload {
  return {
    // Per-show tag: sw-custom.ts falls back to payload.type for the
    // notification tag, so a shared value would make a second show's nudge
    // replace the first instead of showing both.
    type: `show-eve:${showId}`,
    title: `${showName} starts tomorrow`,
    body: 'You judge or run rings tomorrow. Open the show now, while you have internet, so it works without internet at the venue.',
    // Tapping the notification opens the show, which primes the device — the
    // reminder and the fix are the same action.
    data: { actionUrl: `/at-show/${showId}` },
  };
}
