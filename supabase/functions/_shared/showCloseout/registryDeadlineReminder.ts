/**
 * Which registry results deadlines are due a reminder, and the email that carries it (MYK9-2077).
 *
 * Pure and Deno-safe: no Supabase, no clock of its own. The date is NEVER calculated here. It comes
 * from `resultsDeadlineFor` and `lastTrialDay` in `resultsDeadline.ts`, the same functions the
 * Finish the show list calls, so the email and the list name the same day. The only things this
 * file adds are the rules for reading a raw trial row the way the app does (registry and time zone
 * through `registrySelectors.ts`, which the app calls too; cancelled trials, scent-work trials) and
 * for "is this line still open", which is the Finish list's rule: a file sent before a score
 * changed reads as open again (`submissionCoverage.ts`).
 */
import {
  RESULTS_DEADLINE_RULES,
  calendarDayInZone,
  describeResultsDeadline,
  lastTrialDay,
  resultsDeadlineCoversTrialType,
  resultsDeadlineFor,
} from './resultsDeadline.ts';
import {
  FALLBACK_TRIAL_TIME_ZONE,
  selectTrialRegistryId,
  selectTrialTimeZone,
} from '../registrySelectors.ts';
import { APP_SENT_REGISTRIES, coveredUntil, newestSubmissionAt } from './submissionCoverage.ts';

/** One reminder, this many calendar days before the deadline (the deadline day is the last). */
export const REMIND_DAYS_BEFORE = 2;

const REGISTRY_IDS = ['AKC', 'UKC', 'ASCA'] as const;
const SUBMITTED_STATUSES = new Set(['sent', 'submitted']);

export interface ReminderTrial {
  /** `trials.id`; lets a score change be traced to its trial's registry. */
  id?: string | null;
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
  /** `result_submissions.submitted_at`: when the file went. */
  submittedAt?: string | null;
}

/**
 * The newest change to a score the AKC results file carries, for one class, after the file was
 * sent (`entry_score_audit`). `trialId` is the class's trial, `null` when it names none.
 */
export interface ReminderScoreChange {
  trialId: string | null;
  changedAt: string;
}

export interface DueReminder {
  registryId: string;
  /** `YYYY-MM-DD`, the date the Finish the show list shows. */
  deadline: string;
  /** 0 on the deadline day itself, up to {@link REMIND_DAYS_BEFORE}. */
  daysUntil: number;
  /** The open line, as a sentence. */
  openLine: string;
  /** The file was sent, then a score changed: the corrected file is what is owed. */
  corrected: boolean;
}

function normalizeStatus(status: string | null | undefined): string {
  return status?.trim().toLowerCase().replace(/\s+/g, '_') ?? '';
}

/** `getTrialRegistry`: a blank or unknown registry reads as AKC (the same selector the app calls). */
function registryOf(trial: ReminderTrial): string {
  const { id, known } = selectTrialRegistryId(trial.registryId, REGISTRY_IDS);
  return known ? id : 'AKC';
}

/** `getTrialTimezone`: a blank or invalid zone reads as America/New_York (the same selector). */
function zoneOf(trial: ReminderTrial): string {
  return selectTrialTimeZone(trial.timeZone).timeZone;
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

function openLineFor(registryId: string, corrected: boolean): string {
  if (corrected) {
    return `Scores changed after the results file was sent to ${registryId}. The corrected file has not been sent.`;
  }
  return registryId === 'AKC'
    ? 'The results file has not been sent to AKC.'
    : `The results are not marked as submitted to ${registryId}.`;
}

/**
 * A registry's verified deadline for these trials when it is 0 to {@link REMIND_DAYS_BEFORE} days
 * away on the calendar in the zone of the show's last trial day; `null` otherwise. "Today" is the
 * show's own calendar day: the zone of the trial that holds the last day.
 */
function registryWindow(
  allTrials: readonly ReminderTrial[],
  registryId: string,
  now: Date
): { deadline: string; daysUntil: number } | null {
  if (!RESULTS_DEADLINE_RULES[registryId]) return null;
  const trials = allTrials.filter(
    trial =>
      registryOf(trial) === registryId &&
      !['cancelled', 'canceled'].includes(normalizeStatus(trial.status)) &&
      resultsDeadlineCoversTrialType(trial.trialType)
  );
  const lastDay = lastTrialDay(
    trials.map(trial => ({ date: trial.date, timeZone: zoneOf(trial) }))
  );
  const deadline = resultsDeadlineFor(registryId, lastDay);
  if (!deadline || !lastDay) return null;
  const lastTrial = trials.find(trial => calendarDayInZone(trial.date, zoneOf(trial)) === lastDay);
  const today = todayInZone(now, lastTrial ? zoneOf(lastTrial) : FALLBACK_TRIAL_TIME_ZONE);
  const daysUntil = today ? daysBetween(today, deadline) : null;
  if (daysUntil === null || daysUntil < 0 || daysUntil > REMIND_DAYS_BEFORE) return null;
  return { deadline, daysUntil };
}

/** True when any registry's deadline is inside the reminder window: the cheap gate before reading history. */
export function anyDeadlineInWindow(trials: readonly ReminderTrial[], now: Date): boolean {
  return REGISTRY_IDS.some(registryId => registryWindow(trials, registryId, now) !== null);
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
  /** `undefined` = the score history was not read: the file reads as current, as on the list. */
  scoreChanges?: readonly ReminderScoreChange[] | undefined;
  now: Date;
}): DueReminder[] {
  const due: DueReminder[] = [];
  const coverageRows = input.submissions.map(row => ({
    status: row.status,
    organization: row.organization,
    submitted_at: row.submittedAt ?? null,
  }));
  const registryByTrial = new Map<string, string>();
  const showRegistries = new Set<string>();
  for (const trial of input.trials) {
    showRegistries.add(registryOf(trial));
    // Only trials the results file carries: a score change in another discipline's trial
    // (FastCAT on a mixed show) would resend an identical file.
    if (trial.id && resultsDeadlineCoversTrialType(trial.trialType)) {
      registryByTrial.set(trial.id, registryOf(trial));
    }
  }
  for (const registryId of REGISTRY_IDS) {
    const window = registryWindow(input.trials, registryId, input.now);
    if (!window) continue;
    const { deadline, daysUntil } = window;

    // A submission names the registry it went to; one that names none covers every registry.
    const submitted = input.submissions.some(
      row =>
        SUBMITTED_STATUSES.has(normalizeStatus(row.status)) &&
        (!row.organization || row.organization.toUpperCase() === registryId)
    );
    let corrected = false;
    if (submitted) {
      // The Finish list's rule (whatIsLeft.ts): an app-sent file stays true only until a score it
      // carries changes after the newest send or recorded filing.
      const sentAt = APP_SENT_REGISTRIES.includes(registryId)
        ? newestSubmissionAt(coverageRows, registryId, 'sent')
        : null;
      if (sentAt === null) continue;
      const coveredAt = coveredUntil(coverageRows, registryId) ?? sentAt;
      corrected = (input.scoreChanges ?? []).some(change => {
        const belongs =
          change.trialId === null
            ? showRegistries.size === 1
            : registryByTrial.get(change.trialId) === registryId;
        return belongs && Date.parse(change.changedAt) > coveredAt;
      });
      if (!corrected) continue;
    }

    due.push({
      registryId,
      deadline,
      daysUntil,
      corrected,
      openLine: openLineFor(registryId, corrected),
    });
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
