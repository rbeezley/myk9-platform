import { formatTime, formatWeekdayLong } from '@/lib/format/dates';

import type { FirstDayPaperwork } from './firstTrialPaperwork';

/** The words of the "First trial's paperwork printed" line, per state (MYK9-2075). */

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** "Sunday at 6:15 PM" in the show's own zone; empty when the time cannot be read. */
function printedMoment(iso: string, timeZone: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  const day = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone }).format(time);
  return `${day} at ${formatTime(iso, timeZone)}`;
}

function laterTrialsSentence(later: FirstDayPaperwork['laterTrials']): string {
  const byDay = new Map<string, FirstDayPaperwork['laterTrials'][number][]>();
  for (const trial of later) byDay.set(trial.date, [...(byDay.get(trial.date) ?? []), trial]);
  const phrases = [...byDay].map(([date, trials]) => {
    const labels = trials.map(trial => trial.label);
    const names =
      labels.length > 1
        ? `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
        : (labels[0] ?? '');
    const day = formatWeekdayLong(date);
    return `${names} ${trials.length === 1 ? 'prints' : 'print'}${day ? ` on ${day}` : ''}`;
  });
  return `${phrases.join('; ')}, after move-ups.`;
}

function listNames(names: readonly string[]): string {
  if (names.length <= 3) {
    return names.length > 1
      ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
      : (names[0] ?? '');
  }
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more classes`;
}

/** What changed, in words: the first trial's classes, then the dogs' labels. */
function changedPhrase(paperwork: FirstDayPaperwork): string {
  const parts = [
    paperwork.changedClasses.length > 0
      ? listNames(paperwork.changedClasses.map(item => item.name))
      : null,
    paperwork.labelsChanged > 0
      ? plural(paperwork.labelsChanged, 'armband label', 'armband labels')
      : null,
  ].filter(Boolean);
  return parts.join(' and ');
}

export interface FirstTrialLineText {
  detail: string;
  linkLabel?: string;
  /** Where the link goes: the first trial's packet panel, or the first day's labels. */
  door?: 'packet' | 'labels';
}

export function firstTrialLineText(paperwork: FirstDayPaperwork): FirstTrialLineText {
  const { firstTrial } = paperwork;
  if (paperwork.kind === 'unknown' || !firstTrial) return { detail: "Can't check right now" };
  const day = formatWeekdayLong(firstTrial.date);
  const door = paperwork.sheets > 0 ? 'packet' : 'labels';
  const labelCount = paperwork.labelsNotPrinted + paperwork.labelsChanged;
  if (paperwork.kind === 'changed') {
    return {
      detail: `${changedPhrase(paperwork)} changed after ${day ? `${day}'s` : 'the'} paperwork was printed.`,
      linkLabel: 'Print what changed',
      door,
    };
  }
  if (paperwork.kind === 'not-printed') {
    const parts = [
      paperwork.sheets > 0
        ? plural(Math.max(paperwork.judgePackets, 1), 'judge packet', 'judge packets')
        : null,
      labelCount > 0 ? plural(labelCount, 'armband label', 'armband labels') : null,
    ].filter(Boolean);
    const head =
      paperwork.sheets > 0
        ? `${firstTrial.label}${day ? ` on ${day}` : ''}: ${parts.join(' and ')} to print.`
        : `${day ? `${day}: ` : ''}${parts.join(' and ')} to print.`;
    const changed = changedPhrase(paperwork);
    return {
      detail: changed ? `${head} Changed since printing: ${changed}.` : head,
      linkLabel:
        paperwork.sheets > 0
          ? `Print for ${day || firstTrial.label}`
          : `Print labels${day ? ` for ${day}` : ''}`,
      door,
    };
  }
  if (!paperwork.measured) return { detail: `${firstTrial.label} has nothing to print.` };
  const moment = paperwork.printedAt ? printedMoment(paperwork.printedAt, firstTrial.timeZone) : '';
  const lead = moment
    ? `${firstTrial.label} printed ${moment}.`
    : `${firstTrial.label} is printed.`;
  const later =
    paperwork.laterTrials.length > 0 ? ` ${laterTrialsSentence(paperwork.laterTrials)}` : '';
  return { detail: `${lead}${later}` };
}
