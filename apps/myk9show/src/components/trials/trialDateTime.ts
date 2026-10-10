import { format } from 'date-fns';
import { zonedTimeToUtcDate } from '@/features/lifecycle-emails/schedule';
import { formatTime } from '@/lib/format/dates';

/** Parse "9:05 AM" / "09:05 pm" into 24-hour parts, or null when it is not a time. */
export function parseTimeOfDay(text: string): { hours: number; minutes: number } | null {
  const match = text.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?$/);
  if (!match) return null;
  let hours = parseInt(match[1] ?? '', 10);
  const minutes = parseInt(match[2] ?? '', 10);
  const period = match[3]?.toUpperCase();
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

/** True when the text is a real time of day; empty or unparseable text means "no time". */
export function hasTrialTime(text: string): boolean {
  return parseTimeOfDay(text) !== null;
}

/** Zero-padded 12-hour "09:05 AM" from 24-hour parts (no Date: a time of day is not an instant). */
export function formatTimeOfDay(hours: number, minutes: number): string {
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${String(hour12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${period}`;
}

/**
 * One spelling for a time of day: zero-padded 12-hour, "09:05 AM" — the form Edit
 * Trial has always stored and validated. Unparseable text comes back trimmed.
 */
export function normalizeTimeOfDay(text: string): string {
  const parts = parseTimeOfDay(text);
  if (!parts) return text.trim();
  return formatTimeOfDay(parts.hours, parts.minutes);
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
  const parts = startTimeDraft === undefined ? null : parseTimeOfDay(startTimeDraft);
  if (!parts) return '';
  const hh = String(parts.hours).padStart(2, '0');
  const mm = String(parts.minutes).padStart(2, '0');
  return `${trialDate}T${hh}:${mm}:00`;
}

/** What Review shows for a trial's moment: exactly what will be saved, or "Not set". */
export function trialScheduleLabel(trial: {
  trialDate: string;
  startTimeDraft?: string | undefined;
}): string {
  const combined = combineTrialDateTime(trial.trialDate, trial.startTimeDraft);
  if (!combined) return 'Not set';
  const parts = parseTimeOfDay(trial.startTimeDraft ?? '');
  const [year, month, day] = trial.trialDate.split('-').map(Number);
  const at = new Date(
    year ?? 2000,
    (month ?? 1) - 1,
    day ?? 1,
    parts?.hours ?? 0,
    parts?.minutes ?? 0
  );
  return format(at, "MMM d, yyyy 'at' h:mm a");
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
  const time = parseTimeOfDay(clock);
  if (!day || !time) return null;
  return zonedTimeToUtcDate(
    {
      year: Number(day[1]),
      month: Number(day[2]),
      day: Number(day[3]),
      hour: time.hours,
      minute: time.minutes,
      second: 0,
      millisecond: 0,
    },
    timeZone
  ).toISOString();
}

/** A stored instant shown as a clock time in `timeZone`; text that is not an instant passes through. */
export function isoToClock(value: string | undefined, timeZone: string): string {
  if (!value) return '';
  if (parseTimeOfDay(value)) return value;
  return formatTime(value, timeZone) || value;
}
