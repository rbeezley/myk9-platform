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
}

/** A judge assigned to this show, resolved to their auth account. */
export interface ShowEveJudgeRow {
  auth_user_id: string | null;
  status: string | null;
}

/**
 * How long a claim may sit undelivered before another run may take it over.
 * Long enough that a healthy in-flight run is never stolen from, far shorter
 * than the daily cadence so a crashed run costs at most one cycle.
 */
export const CLAIM_LEASE_MS = 15 * 60 * 1000;

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
  assignment: { trial_id: string | null },
  trialId: string
): boolean {
  return assignment.trial_id === null || assignment.trial_id === trialId;
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
const SHOW_DAY_STAFF_ROLES = new Set(['secretary', 'club_admin', 'chairman', 'steward', 'judge']);

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
