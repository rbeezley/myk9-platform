import { getTrialTimezone } from '@/features/registries';
import { computeDayTrialNumber } from '@/pages/secretary/ReportsPage/dayTrialNumber';
import type { DbTrial } from '@/types/database-mappings';

import type { SecretaryCockpitPaperwork } from './secretaryCockpitTypes';

/**
 * The night-before line "First trial's paperwork printed" (MYK9-2075, owner-approved mock-up in
 * docs/plan-print-packets.md): measures the first trial's check-in sheets and score sheets plus the
 * first day's armband labels, in four states (not printed, changed since printing, printed, can't
 * check). Pure: it reads the paperwork map other modules computed.
 */

export interface PaperworkTrial {
  id: string;
  trialDate: string;
  trialNumber?: string | number | null | undefined;
  plannedStartTime?: string | null | undefined;
  order?: string | number | null | undefined;
  timezone?: string | null | undefined;
}

export interface PaperworkClass {
  id: string;
  trialId?: string | null;
  name?: string | null | undefined;
  element?: string | null | undefined;
  level?: string | null | undefined;
  judgeName?: string | null | undefined;
}

export type PaperworkRows = ReadonlyMap<string, readonly SecretaryCockpitPaperwork[]>;

/** The before-class print items of the per-class checklist (classChecklist.ts). */
const PRE_SHOW_SHEETS: ReadonlySet<string> = new Set(['check-in-sheet', 'scoresheet']);
const ARMBAND_LABELS = 'armband-labels';

export type FirstTrialPaperworkKind = 'not-printed' | 'changed' | 'printed' | 'unknown';

export interface FirstDayPaperwork {
  status: 'pass' | 'fail' | 'unknown';
  kind: FirstTrialPaperworkKind;
  /** Sheets of the first trial that are not printed or changed since printing. */
  sheets: number;
  /** The first trial's judge packets that still need printing. */
  judgePackets: number;
  /** Dogs on the first day whose class has armband labels still to print. */
  labelDogs: number;
  /** Classes (first trial sheets, first day labels) printed and then changed. */
  changedClassNames: readonly string[];
  /** Phrases of the "printed" state: when the newest covering print happened and what is later. */
  printedAt: string | null;
  firstTrial: { id: string; dayNumber: number; date: string; timeZone: string } | null;
  laterTrials: readonly { dayNumber: number; date: string }[];
}

const EMPTY: FirstDayPaperwork = {
  status: 'unknown',
  kind: 'unknown',
  sheets: 0,
  judgePackets: 0,
  labelDogs: 0,
  changedClassNames: [],
  printedAt: null,
  firstTrial: null,
  laterTrials: [],
};

const asDbTrial = (trial: PaperworkTrial): DbTrial =>
  ({
    id: trial.id,
    date: trial.trialDate,
    // Always a string, as the column is: a number from a fixture or a cached row must not crash.
    trial_number: trial.trialNumber == null ? null : String(trial.trialNumber),
    planned_start_time: trial.plannedStartTime ?? null,
    display_order: trial.order == null || trial.order === '' ? null : Number(trial.order),
    created_at: null,
  }) as unknown as DbTrial;

/** Trials in show order: by day, then the day's trial order (the reports' own rule), then as given. */
export function orderedTrials<T extends PaperworkTrial>(trials: readonly T[]): T[] {
  const all = trials.map(asDbTrial);
  return trials
    .map((trial, index) => ({
      trial,
      index,
      dayNumber: computeDayTrialNumber(all[index]!, all) ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort(
      (left, right) =>
        left.trial.trialDate.localeCompare(right.trial.trialDate) ||
        left.dayNumber - right.dayNumber ||
        left.index - right.index
    )
    .map(row => row.trial);
}

/** The show's first day: the earliest trial date, or undefined when no trial has one. */
export function earliestTrialDate(trials: readonly { trialDate: string }[]): string | undefined {
  const dates = trials.map(trial => trial.trialDate).filter(Boolean);
  return dates.length === 0
    ? undefined
    : dates.reduce((earliest, date) => (date < earliest ? date : earliest));
}

/** The first trial of the show's first day: the one whose packet the checklist line opens. */
export function firstTrialOfFirstDay(trials: readonly PaperworkTrial[]): string | undefined {
  return orderedTrials(trials.filter(trial => trial.trialDate))[0]?.id;
}

function dayNumberOf(trial: PaperworkTrial, trials: readonly PaperworkTrial[]): number {
  const all = trials.map(asDbTrial);
  const index = trials.indexOf(trial);
  return (index >= 0 ? computeDayTrialNumber(all[index]!, all) : undefined) ?? 1;
}

export function classDisplayName(cls: PaperworkClass): string {
  const composed = [cls.element, cls.level].filter(Boolean).join(' ');
  return composed || cls.name || 'A class';
}

/**
 * Rolls the per-class paperwork map up to what the night before needs: the first trial's sheets and
 * the first day's labels. Later trials print after move-ups, so they are not measured. Unknown never
 * counts as printed: while the rows or print history cannot be trusted the answer is `unknown`.
 */
export function rollUpFirstDayPaperwork(input: {
  trials: readonly PaperworkTrial[];
  classes: readonly PaperworkClass[];
  byClassId: PaperworkRows;
  available: boolean;
  /** Dogs entered per class, for the label count; a class without a count counts no dogs. */
  dogsByClassId?: ReadonlyMap<string, number> | undefined;
}): FirstDayPaperwork {
  const sorted = orderedTrials(input.trials.filter(trial => trial.trialDate));
  const first = sorted[0];
  if (!input.available || !first) return EMPTY;
  const firstDate = first.trialDate;
  const firstDayTrials = new Set(
    sorted.filter(trial => trial.trialDate === firstDate).map(trial => trial.id)
  );
  let sheets = 0;
  let unprinted = 0;
  let labelDogs = 0;
  let unknown = false;
  let newestPrint: string | null = null;
  const judges = new Set<string>();
  const changed = new Set<string>();
  for (const classItem of input.classes) {
    if (!classItem.trialId || !firstDayTrials.has(classItem.trialId)) continue;
    for (const row of input.byClassId.get(classItem.id) ?? []) {
      const isSheet = PRE_SHOW_SHEETS.has(row.reportId) && classItem.trialId === first.id;
      if (!isSheet && row.reportId !== ARMBAND_LABELS) continue;
      if (row.state === 'unknown') {
        unknown = true;
        continue;
      }
      if (row.state === 'current') {
        if (isSheet && row.printedAt && (!newestPrint || row.printedAt > newestPrint)) {
          newestPrint = row.printedAt;
        }
        continue;
      }
      if (row.state === 'stale') changed.add(classDisplayName(classItem));
      else if (isSheet) unprinted += 1;
      if (isSheet) {
        sheets += 1;
        judges.add(classItem.judgeName?.trim() || '');
      } else {
        labelDogs += input.dogsByClassId?.get(classItem.id) ?? 0;
      }
    }
  }
  const firstTrial = {
    id: first.id,
    dayNumber: dayNumberOf(first, input.trials),
    date: firstDate,
    timeZone: getTrialTimezone({ id: first.id, timezone: first.timezone ?? null }),
  };
  const laterTrials = sorted
    .filter(trial => trial.id !== first.id)
    .map(trial => ({ dayNumber: dayNumberOf(trial, input.trials), date: trial.trialDate }));
  const base = { sheets, judgePackets: judges.size, labelDogs, firstTrial, laterTrials };
  const nothingChanged = changed.size === 0;
  if (sheets > 0 || labelDogs > 0 || changed.size > 0) {
    return {
      ...base,
      status: 'fail',
      kind: changed.size > 0 && unprinted === 0 ? 'changed' : 'not-printed',
      changedClassNames: [...changed].sort(),
      printedAt: newestPrint,
    };
  }
  return {
    ...base,
    status: unknown ? 'unknown' : 'pass',
    kind: unknown ? 'unknown' : 'printed',
    changedClassNames: nothingChanged ? [] : [...changed],
    printedAt: newestPrint,
  };
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** "Monday" for a `YYYY-MM-DD` trial date: a calendar date has no zone to shift. */
export function dayName(date: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(`${date.slice(0, 10)}T12:00:00Z`)
  );
}

/** "Sunday at 6:15 PM" in the show's own zone. */
function printedMoment(iso: string, timeZone: string): string {
  const at = new Date(iso);
  const day = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone }).format(at);
  const time = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(at);
  return `${day} at ${time}`;
}

function laterTrialsSentence(later: FirstDayPaperwork['laterTrials']): string {
  const byDay = new Map<string, number[]>();
  for (const trial of later)
    byDay.set(trial.date, [...(byDay.get(trial.date) ?? []), trial.dayNumber]);
  const phrases = [...byDay].map(([date, numbers]) => {
    const names =
      numbers.length === 1
        ? `Trial ${numbers[0]}`
        : `Trials ${numbers.slice(0, -1).join(', ')} and ${numbers[numbers.length - 1]}`;
    return `${names} ${numbers.length === 1 ? 'prints' : 'print'} on ${dayName(date)}`;
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

export interface FirstTrialLineText {
  detail?: string;
  linkLabel?: string;
}

/** The line's detail and link wording per state; nothing for a pass without a trial to name. */
export function firstTrialLineText(paperwork: FirstDayPaperwork): FirstTrialLineText {
  const { firstTrial } = paperwork;
  if (paperwork.kind === 'unknown' || !firstTrial) return { detail: "Can't check right now" };
  const day = dayName(firstTrial.date);
  const trialName = `Trial ${firstTrial.dayNumber}`;
  if (paperwork.kind === 'changed') {
    return {
      detail: `${listNames(paperwork.changedClassNames)} changed after ${day}'s paperwork was printed.`,
      linkLabel: 'Print what changed',
    };
  }
  if (paperwork.kind === 'not-printed') {
    const parts = [
      paperwork.judgePackets > 0 || paperwork.sheets > 0
        ? plural(Math.max(paperwork.judgePackets, 1), 'judge packet', 'judge packets')
        : null,
      paperwork.labelDogs > 0
        ? plural(paperwork.labelDogs, 'armband label', 'armband labels')
        : null,
    ].filter(Boolean);
    return {
      detail: `${trialName} on ${day}: ${parts.join(' and ')} to print.`,
      linkLabel: `Print for ${day}`,
    };
  }
  const when = paperwork.printedAt
    ? ` printed ${printedMoment(paperwork.printedAt, firstTrial.timeZone)}.`
    : ' printed.';
  const later =
    paperwork.laterTrials.length > 0 ? ` ${laterTrialsSentence(paperwork.laterTrials)}` : '';
  return { detail: `${trialName}${when}${later}` };
}
