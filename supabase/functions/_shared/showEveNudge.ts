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

export interface ShowEveNudgePayload {
  title: string;
  body: string;
  data: { url: string };
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
    title: `${showName} starts tomorrow`,
    body: 'You judge or run rings tomorrow. Open the show now, while you have internet, so it works without internet at the venue.',
    // Tapping the notification opens the show, which primes the device — the
    // reminder and the fix are the same action.
    data: { url: `/at-show/${showId}` },
  };
}
