import { format } from 'date-fns';
import {
  formatClockTime,
  formatClockTime24,
  parseStoredClockTime,
  storeClockTime,
} from '@myk9/core';
import { zonedTimeToUtcDate } from '@/features/lifecycle-emails/schedule';
import { formatTime } from '@/lib/format/dates';

/** True when the text is a real time of day; empty or unparseable text means "no time". */
export function hasTrialTime(text: string): boolean {
  return parseStoredClockTime(text) !== null;
}

/**
 * One spelling for a stored trial time of day: zero-padded 12-hour, "09:05 AM" — the
 * form Edit Trial has always stored and validated. Unparseable text comes back trimmed.
 */
export function normalizeTimeOfDay(text: string): string {
  const minutes = parseStoredClockTime(text);
  return minutes === null ? text.trim() : storeClockTime(minutes, 'text');
}

/**
 * THE join of a wizard trial's stored date (`yyyy-MM-dd`) and its typed start time
 * (MYK9-931). Returns a local `yyyy-MM-ddTHH:mm:00` string, or '' when either half
 * is missing or invalid. It never supplies a default time or date, so everything
 * that reads a trial's moment (Review, validation, the save payload) sees the same
 * thing, and a missing half is visibly missing.
 */
export function combineTrialDateTime(
  trialDate: string | undefined,
  startTimeDraft: string | undefined
): string {
  if (!trialDate || !/^\d{4}-\d{2}-\d{2}$/.test(trialDate)) return '';
  const minutes = parseStoredClockTime(startTimeDraft);
  if (minutes === null) return '';
  return `${trialDate}T${formatClockTime24(minutes)}:00`;
}

/** What Review shows for a trial's moment: exactly what will be saved, or "Not set". */
export function trialScheduleLabel(trial: {
  trialDate: string;
  startTimeDraft?: string | undefined;
}): string {
  const combined = combineTrialDateTime(trial.trialDate, trial.startTimeDraft);
  if (!combined) return 'Not set';
  const minutes = parseStoredClockTime(trial.startTimeDraft) ?? 0;
  const [year, month, day] = trial.trialDate.split('-').map(Number);
  const at = new Date(year ?? 2000, (month ?? 1) - 1, day ?? 1);
  return `${format(at, 'MMM d, yyyy')} at ${formatClockTime(minutes)}`;
}

export type TrialStartTimeIssue = 'blank' | 'invalid';

/**
 * THE start-time rule for a wizard trial (MYK9-931). The box's typed text
 * (`startTimeDraft`) is the single source of truth: Next, Review and the save
 * payload all ask this one function. A trial that was never edited has no draft
 * is a missing time; a draft that is blank or not a time is one.
 */
export function trialStartTimeIssues(trial: {
  startTimeDraft?: string | undefined;
}): TrialStartTimeIssue | null {
  const draft = trial.startTimeDraft;
  // A time nobody typed is a missing time, never a default.
  if (draft === undefined || draft.trim() === '') return 'blank';
  return hasTrialTime(draft) ? null : 'invalid';
}

/** The sentence for an issue; with a trial name it names the trial. */
export function trialStartTimeMessage(issue: TrialStartTimeIssue, trialName?: string): string {
  const forTrial = trialName ? ` for ${trialName}` : '';
  return issue === 'blank'
    ? `Please enter a start time${forTrial}`
    : `Please enter a valid start time${forTrial} (e.g., 9:00 AM)`;
}

/**
 * `yyyy-MM-dd` + a typed clock time in `timeZone` -> ISO instant, or null if either is
 * unreadable. Actual start/finish columns are timestamptz, so a typed clock must become an
 * instant on the trial's own date and zone before it is written (MYK9-1086).
 */
export function clockOnDateToIso(date: string, clock: string, timeZone: string): string | null {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const minutes = parseStoredClockTime(clock);
  if (!day || minutes === null) return null;
  return zonedTimeToUtcDate(
    {
      year: Number(day[1]),
      month: Number(day[2]),
      day: Number(day[3]),
      hour: Math.floor(minutes / 60),
      minute: minutes % 60,
      second: 0,
      millisecond: 0,
    },
    timeZone
  ).toISOString();
}

/** A stored instant shown as a clock time in `timeZone`; text that is not an instant passes through. */
export function isoToClock(value: string | undefined, timeZone: string): string {
  if (!value) return '';
  if (parseStoredClockTime(value) !== null) return value;
  return formatTime(value, timeZone) || value;
}
