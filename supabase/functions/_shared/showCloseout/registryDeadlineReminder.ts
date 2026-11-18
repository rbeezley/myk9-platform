/**
 * Which registry results deadlines are due a reminder, and the email that carries it (MYK9-2077).
 *
 * Pure and Deno-safe: no Supabase, no clock of its own. The date is NEVER calculated here. It comes
 * from `resultsDeadlineFor` and `lastTrialDay` in `resultsDeadline.ts`, the same functions the
 * Finish the show list calls, so the email and the list name the same day. The only things this
 * file adds are the rules for reading a raw trial row the way the app does (registry fallback, time
 * zone fallback, cancelled trials, scent-work trials) and for "is this line still open".
 */
import {
  RESULTS_DEADLINE_RULES,
  calendarDayInZone,
  describeResultsDeadline,
  lastTrialDay,
  resultsDeadlineCoversTrialType,
  resultsDeadlineFor,
} from './resultsDeadline.ts';

/** One reminder, this many calendar days before the deadline (the deadline day is the last). */
export const REMIND_DAYS_BEFORE = 2;

const REGISTRY_IDS = ['AKC', 'UKC', 'ASCA'] as const;
const FALLBACK_TIME_ZONE = 'America/New_York';
const SUBMITTED_STATUSES = new Set(['sent', 'submitted']);

export interface ReminderTrial {
  /** `trials.date`. */
  date: string | null;
  /** `trials.timezone`. */
  timeZone: string | null;
  /** `trials.registry_id`. */
  registryId: string | null;
  /** `trials.trial_type`. */
  trialType: string | null;
  /** `trials.status`. */
  status: string | null;
}

export interface ReminderSubmission {
  /** `result_submissions.organization`. */
  organization: string | null;
  /** `result_submissions.status`. */
  status: string | null;
}

export interface DueReminder {
  registryId: string;
  /** `YYYY-MM-DD`, the date the Finish the show list shows. */
  deadline: string;
  /** 0 on the deadline day itself, up to {@link REMIND_DAYS_BEFORE}. */
  daysUntil: number;
  /** The open line, as a sentence. */
  openLine: string;
}

function normalizeStatus(status: string | null | undefined): string {
  return status?.trim().toLowerCase().replace(/\s+/g, '_') ?? '';
}

/** `getTrialRegistry`: a blank or unknown registry reads as AKC. */
function registryOf(trial: ReminderTrial): string {
  const id = trial.registryId?.trim() || 'AKC';
  return (REGISTRY_IDS as readonly string[]).includes(id) ? id : 'AKC';
}

function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** `getTrialTimezone`: a blank or invalid zone reads as America/New_York. */
function zoneOf(trial: ReminderTrial): string {
  const raw = trial.timeZone?.trim();
  return raw && isValidTimeZone(raw) ? raw : FALLBACK_TIME_ZONE;
}

/** The calendar day (`YYYY-MM-DD`) an instant falls on in a time zone. */
export function todayInZone(now: Date, timeZone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const get = (type: string) => parts.find(part => part.type === type)?.value;
    const [year, month, day] = [get('year'), get('month'), get('day')];
    return year && month && day ? `${year}-${month}-${day}` : null;
  } catch {
    return null;
  }
}

function daysBetween(from: string, to: string): number | null {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Number.isNaN(start) || Number.isNaN(end) ? null : Math.round((end - start) / 86_400_000);
}

function openLineFor(registryId: string): string {
  return registryId === 'AKC'
    ? 'The results file has not been sent to AKC.'
    : `The results are not marked as submitted to ${registryId}.`;
}

/**
 * The reminders due for one show right now: a registry with a verified deadline, a line still open
 * (nothing sent or submitted for it), and a deadline 0 to {@link REMIND_DAYS_BEFORE} days away on
 * the calendar in the zone of the show's last trial day. The window is open on the day itself so a
 * run that was down on the day two days out still sends once; the idempotency record keeps it to one.
 */
export function dueRegistryReminders(input: {
  trials: readonly ReminderTrial[];
  submissions: readonly ReminderSubmission[];
  now: Date;
}): DueReminder[] {
  const due: DueReminder[] = [];
  for (const registryId of REGISTRY_IDS) {
    if (!RESULTS_DEADLINE_RULES[registryId]) continue;
    const trials = input.trials.filter(
      trial =>
        registryOf(trial) === registryId &&
        !['cancelled', 'canceled'].includes(normalizeStatus(trial.status)) &&
        resultsDeadlineCoversTrialType(trial.trialType)
    );
    const lastDay = lastTrialDay(
      trials.map(trial => ({ date: trial.date, timeZone: zoneOf(trial) }))
    );
    const deadline = resultsDeadlineFor(registryId, lastDay);
    if (!deadline || !lastDay) continue;

    const closed = input.submissions.some(
      row =>
        SUBMITTED_STATUSES.has(normalizeStatus(row.status)) &&
        (!row.organization || row.organization.trim().toUpperCase() === registryId)
    );
    if (closed) continue;

    // "Today" is the show's own calendar day: the zone of the trial that holds the last day.
    const lastTrial = trials.find(
      trial => calendarDayInZone(trial.date, zoneOf(trial)) === lastDay
    );
    const today = todayInZone(input.now, lastTrial ? zoneOf(lastTrial) : FALLBACK_TIME_ZONE);
    const daysUntil = today ? daysBetween(today, deadline) : null;
    if (daysUntil === null || daysUntil < 0 || daysUntil > REMIND_DAYS_BEFORE) continue;

    due.push({ registryId, deadline, daysUntil, openLine: openLineFor(registryId) });
  }
  return due;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function whenText(reminder: DueReminder): string {
  if (reminder.daysUntil === 0) return 'today';
  if (reminder.daysUntil === 1) return 'tomorrow';
  return `in ${reminder.daysUntil} days`;
}

/** Where the secretary finishes the line: the Finish the show list on the show's Results tab. */
export function finishListUrl(appOrigin: string, showId: string): string {
  return `${appOrigin.replace(/\/+$/, '')}/shows/${encodeURIComponent(showId)}/results#finish-the-show`;
}

export function buildRegistryDeadlineSubject(showName: string, reminder: DueReminder): string {
  return `${showName}: ${reminder.registryId} results are due ${whenText(reminder)}`;
}

export function buildRegistryDeadlineHtml(input: {
  showName: string;
  reminder: DueReminder;
  finishUrl: string;
}): string {
  const { reminder } = input;
  const showName = escapeHtml(input.showName);
  const dueText = escapeHtml(
    describeResultsDeadline(reminder.registryId, reminder.deadline) ??
      `Due to ${reminder.registryId} by ${reminder.deadline}`
  );
  const url = escapeHtml(input.finishUrl);
  return `<!doctype html>
<html lang="en">
  <body style="font-family:Arial,sans-serif;color:#172033;line-height:1.5">
    <h1 style="font-size:22px">${showName}: ${escapeHtml(reminder.registryId)} paperwork is still open</h1>
    <p><strong>${dueText}.</strong> That is ${whenText(reminder)}.</p>
    <p>Still open on your Finish the show list:</p>
    <ul>
      <li>${escapeHtml(reminder.openLine)}</li>
    </ul>
    <p><a href="${url}" style="display:inline-block;background:#1d4ed8;color:#ffffff;padding:10px 16px;border-radius:6px;text-decoration:none">Open the Finish the show list</a></p>
    <p style="color:#475569;font-size:13px">This is the only reminder for this deadline. It is sent once, and only while this line is still open. If you have already done it, mark it on the list and you will not hear from us again.</p>
  </body>
</html>`;
}
