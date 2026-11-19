import { livePremiumClasses, livePremiumTrials, storedStartMinutes } from './liveTrials.ts';
import type { PremiumNarratives } from './publishedNarratives.ts';

/**
 * MYK9-2055: "Show Hours" and "Trial Information" are built from the show's facts (dates, trials,
 * start times, classes, venue), never by a model. The same show always yields the same text.
 * Nothing here invents a time, a duration or a rule the show did not state.
 */

export interface NarrativeClassRow {
  name?: string | null;
  level?: string | null;
  element?: string | null;
  status?: string | null;
  deleted_at?: string | null;
}

export interface NarrativeTrialRow {
  id?: string | null;
  name?: string | null;
  date?: string | null;
  planned_start_time?: string | null;
  trial_type?: string | null;
  status?: string | null;
  deleted_at?: string | null;
  classes?: readonly NarrativeClassRow[] | null;
}

export interface NarrativeShowRow {
  name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  location?: string | null;
  venue_name?: string | null;
  city?: string | null;
  state?: string | null;
  trials?: readonly NarrativeTrialRow[] | null;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "March 3, 2027" from a YYYY-MM-DD (or ISO timestamp) string; '' when unreadable. */
export function formatNarrativeDate(value: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  if (!match) return '';
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return '';
  return `${month} ${Number(match[3])}, ${match[1]}`;
}

/** "9:00 AM" from a stored start time; '' when unreadable. */
export function formatNarrativeTime(value: string | null | undefined): string {
  const minutes = storedStartMinutes(value);
  if (minutes === null) return '';
  const hour24 = Math.floor(minutes / 60);
  const minute = String(minutes % 60).padStart(2, '0');
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${minute} ${hour24 < 12 ? 'AM' : 'PM'}`;
}

function clean(value: string | null | undefined): string {
  return (value ?? '').trim();
}

function venueText(show: NarrativeShowRow): string {
  const place = [clean(show.city), clean(show.state)].filter(Boolean).join(', ');
  const venueName = clean(show.venue_name) || clean(show.location);
  return [venueName, place].filter(Boolean).join(', ');
}

function trialLabel(trial: NarrativeTrialRow): string {
  return clean(trial.name) || 'Trial';
}

function trialDay(trial: NarrativeTrialRow): string {
  const date = formatNarrativeDate(trial.date);
  return date ? ` (${date})` : '';
}

function showHoursText(show: NarrativeShowRow, trials: readonly NarrativeTrialRow[]): string {
  if (trials.length === 0) return '';
  const sentences: string[] = [];
  const name = clean(show.name) || 'This show';
  const start = formatNarrativeDate(show.start_date);
  const end = formatNarrativeDate(show.end_date);
  const venue = venueText(show);
  const where = venue ? ` at ${venue}` : '';
  if (start && end && start !== end) sentences.push(`${name} runs ${start} to ${end}${where}.`);
  else if (start || end) sentences.push(`${name} takes place on ${start || end}${where}.`);
  else if (venue) sentences.push(`${name} takes place at ${venue}.`);

  const unscheduled: string[] = [];
  for (const trial of trials) {
    const time = formatNarrativeTime(trial.planned_start_time);
    if (time) sentences.push(`${trialLabel(trial)}${trialDay(trial)} starts at ${time}.`);
    else unscheduled.push(trialLabel(trial));
  }
  if (unscheduled.length > 0) {
    sentences.push(`The start time for ${unscheduled.join(', ')} will be announced.`);
  }
  return sentences.join(' ');
}

function classLabel(cls: NarrativeClassRow): string {
  const label = [clean(cls.level), clean(cls.element)].filter(Boolean).join(' ');
  return label || clean(cls.name);
}

function trialInformationText(trials: readonly NarrativeTrialRow[]): string {
  if (trials.length === 0) return '';
  const lead =
    trials.length === 1 ? 'One trial is offered.' : `${trials.length} trials are offered.`;
  const lines = trials.map(trial => {
    const type = clean(trial.trial_type);
    const classes = livePremiumClasses(trial.classes).map(classLabel).filter(Boolean);
    const parts = [`${trialLabel(trial)}${trialDay(trial)}${type ? `: ${type}.` : '.'}`];
    if (classes.length > 0) parts.push(`Classes: ${classes.join(', ')}.`);
    return parts.join(' ');
  });
  return [lead, ...lines].join(' ');
}

/** The two narratives for this show, from its live trials only (a cancelled trial is not printed). */
export function buildPremiumNarratives(show: NarrativeShowRow): PremiumNarratives {
  const trials = livePremiumTrials(show.trials as NarrativeTrialRow[] | null | undefined);
  return {
    showHours: showHoursText(show, trials),
    trialInformation: trialInformationText(trials),
  };
}

/**
 * A narrative a secretary already published (and may have edited) is kept as is; only a blank
 * section takes the built text. Saved edits are never overwritten.
 */
export function resolvePremiumNarratives(
  published: PremiumNarratives,
  built: PremiumNarratives
): PremiumNarratives {
  return {
    showHours: published.showHours.trim() ? published.showHours : built.showHours,
    trialInformation: published.trialInformation.trim()
      ? published.trialInformation
      : built.trialInformation,
  };
}
