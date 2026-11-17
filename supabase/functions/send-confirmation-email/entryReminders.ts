// The show reminder (MYK9-2113): rules only, Deno-free so vitest can import them.
//
// One email per exhibitor per show, two days before the show's first day in the show's own time
// zone, to every exhibitor with a live entry. The secretary sets no date and presses nothing.
// The cron job calls hourly; a show is due only on its reminder day, and only between
// REMINDER_FIRST_HOUR and REMINDER_LAST_HOUR local, so it arrives in the morning and a failed
// send is retried a few times that morning. A reminder missed that day is never sent late.
//
// Decided (owner review, MYK9-2113): a live entry with no armband still gets a reminder, with a
// dash for the armband; and the reminder does not follow the "accepted email" switch, because it
// is its own email and the plan gives the secretary no switch for it.

import {
  dateInZone,
  showTakesConfirmations,
  showTimeZone,
  type ConfirmationShow,
} from './entryConfirmations.ts';

/** How many days before the first day the reminder goes. */
export const REMINDER_DAYS_BEFORE = 2;
/** The local hours (inclusive) in which a due show's reminder may go: 08:00 to 11:59. */
export const REMINDER_FIRST_HOUR = 8;
export const REMINDER_LAST_HOUR = 11;
/**
 * A claim (reminder_email_sent_at set, status still 'pending') this old belongs to a run that
 * crashed between the claim and its mark, so the next run may claim it again. Resend's
 * idempotency key is the same for the same entries, so a send that did go out is not repeated.
 */
export const REMINDER_CLAIM_STALE_MS = 30 * 60 * 1000;
/** Exhibitors emailed per run; the rest wait for the next hourly run that morning. */
export const REMINDER_MAX_EMAILS_PER_RUN = 100;

/** "YYYY-MM-DD" plus whole days, in calendar terms (no time zone involved). */
export function addCalendarDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The hour (0 to 23) in a time zone. */
export function hourInZone(now: Date, timeZone: string): number {
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hourCycle: 'h23',
  }).format(now);
  return Number(hour);
}

/**
 * True when this show's reminder goes now: it is published (a cancelled, draft or deleted show
 * is not), today in its own time zone is exactly two days before its first day, and the local
 * hour is inside the morning window.
 */
export function showReminderIsDue(show: ConfirmationShow, now: Date): boolean {
  if (!showTakesConfirmations(show, now)) return false;
  const zone = showTimeZone(show.trials);
  if (dateInZone(now, zone) !== addCalendarDays(show.start_date, -REMINDER_DAYS_BEFORE)) {
    return false;
  }
  const hour = hourInZone(now, zone);
  return hour >= REMINDER_FIRST_HOUR && hour <= REMINDER_LAST_HOUR;
}

/** The subject: always names the show. */
export function reminderSubject(showName: string): string {
  return `Reminder: ${showName} starts in two days`;
}

/** Resend's idempotency key: the show, the exhibitor and the entries the reminder covers. */
export async function reminderIdempotencyKey(
  groupKey: string,
  entryIds: string[]
): Promise<string> {
  const data = new TextEncoder().encode(`${groupKey}|${[...entryIds].sort().join(',')}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  return `show-reminder:${hex.slice(0, 48)}`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Puts a one-line "this is your reminder" strip at the top of the show's styled confirmation
 * body, so every one of the eight styles reads as the reminder it is. The strip is plain
 * table markup with inline styles (email clients strip everything else).
 */
export function withReminderStrip(html: string, showTitle: string, dateRange: string): string {
  const strip = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#222222;"><tr><td align="center" style="padding:10px 16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.4;color:#ffffff;">Reminder: ${esc(showTitle)} starts in two days (${esc(dateRange)}). Your details are below.</td></tr></table>`;
  return html.replace(/<body[^>]*>/i, match => `${match}${strip}`);
}
