import { calendarDateInTimeZone } from '@/utils/calendarDate';
import { getEntryManagementHref } from '@/features/entry-operations/entryAttentionRoutes';
import type { ClassEntryBreakdown } from '@/features/entry-operations/classEntryBreakdown';
import type { OfflineReadiness } from '@/features/offline-readiness/computeOfflineReadiness';
import type { PremiumPublishStateInput } from '@/features/show-workbench/premiumPublishState';
import {
  computeSetupReadinessSignals,
  type SetupReadinessInput,
  type SetupReadinessSignal,
  type SetupReadinessSignalId,
} from '@/features/show-workbench/setupReadinessSignals';

import { getShowHomeHref } from './cockpitRoutes';
import type { SecretaryCockpitPaperwork } from './secretaryCockpitTypes';

/**
 * The "Ready for show day" roll-up on the secretary Overview (MYK9-1145): one pass/fail line per
 * check that already exists elsewhere. Pure -- it reads results other modules computed and never
 * re-derives them. `unknown` is its own state: a disabled, paused or empty read must never pass.
 */

/** The section shows from this many calendar days before the start date. */
export const READY_WINDOW_DAYS = 7;

export type ReadyLineStatus = 'pass' | 'fail' | 'unknown';

export interface ReadyLine {
  id: string;
  label: string;
  status: ReadyLineStatus;
  /** Plain-words reason; present on fail and unknown lines. */
  detail?: string;
  /** The existing page (or in-page anchor) that fixes a failing line. */
  href?: string;
}

export interface ReadyForShowDay {
  lines: ReadyLine[];
  allClear: boolean;
}

const DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

function dayNumber(date: string): number | null {
  const match = DATE_PREFIX.exec(date);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86_400_000;
}

/** Whole calendar days from `today` to `startDate` (both `YYYY-MM-DD`); null when unreadable. */
export function daysUntilShowStart(startDate: string, today: string): number | null {
  const start = dayNumber(startDate);
  const current = dayNumber(today);
  return start === null || current === null ? null : start - current;
}

/**
 * True from 7 calendar days before the start date through the day before it, on the show's own
 * calendar. The start day itself and past shows are hidden: on show day the cockpit takes over.
 */
export function isReadyForShowDayWindow(input: {
  startDate: string | null | undefined;
  now: Date;
  timeZone: string;
}): boolean {
  if (!input.startDate) return false;
  const days = daysUntilShowStart(
    input.startDate,
    calendarDateInTimeZone(input.now, input.timeZone)
  );
  return days !== null && days >= 1 && days <= READY_WINDOW_DAYS;
}

/** The show's first day: the earliest trial date, or undefined when no trial has one. */
function earliestTrialDate(trials: readonly { trialDate: string }[]): string | undefined {
  const dates = trials.map(trial => trial.trialDate).filter(Boolean);
  return dates.length === 0
    ? undefined
    : dates.reduce((earliest, date) => (date < earliest ? date : earliest));
}

type PaperworkRows = ReadonlyMap<string, readonly SecretaryCockpitPaperwork[]>;

/** The before-class print items of the per-class checklist (classChecklist.ts). */
const PRE_SHOW_SHEETS: ReadonlySet<string> = new Set(['check-in-sheet', 'scoresheet']);

export interface FirstDayPaperwork {
  status: ReadyLineStatus;
  /** Sheets not printed or printed before the class changed. */
  outstanding: number;
}

/**
 * Rolls the existing per-class paperwork map up to the show's FIRST day. Unknown never counts as
 * printed: while the class rows or print history cannot be trusted the answer is `unknown`.
 */
export function rollUpFirstDayPaperwork(input: {
  trials: readonly { id: string; trialDate: string }[];
  classes: readonly { id: string; trialId?: string | null }[];
  byClassId: PaperworkRows;
  available: boolean;
}): FirstDayPaperwork {
  const firstDate = earliestTrialDate(input.trials);
  if (!input.available || !firstDate) return { status: 'unknown', outstanding: 0 };
  const firstDayTrials = new Set(
    input.trials.filter(trial => trial.trialDate === firstDate).map(trial => trial.id)
  );
  let outstanding = 0;
  let unknown = false;
  for (const classItem of input.classes) {
    if (!classItem.trialId || !firstDayTrials.has(classItem.trialId)) continue;
    for (const row of input.byClassId.get(classItem.id) ?? []) {
      if (!PRE_SHOW_SHEETS.has(row.reportId)) continue;
      if (row.state === 'unknown') unknown = true;
      else if (row.state !== 'current') outstanding += 1;
    }
  }
  if (outstanding > 0) return { status: 'fail', outstanding };
  return { status: unknown ? 'unknown' : 'pass', outstanding: 0 };
}

function sumPending(byClassId: ReadonlyMap<string, ClassEntryBreakdown>): number {
  let total = 0;
  for (const { pending } of byClassId.values()) total += pending;
  return total;
}

export interface ReadyForShowDayInput {
  setup: Omit<SetupReadinessInput, 'premiumInfo' | 'judges'>;
  /** The freshly read publish columns; null until that read resolved online. */
  premiumInfo: (PremiumPublishStateInput & { experienceIsPublished?: boolean | null }) | null;
  /** Per-class entry counts; undefined while the entries read is unavailable. */
  entryBreakdownByClassId: ReadonlyMap<string, ClassEntryBreakdown> | undefined;
  paperwork: FirstDayPaperwork;
  /** This device's offline readiness; null when it could not be measured. */
  offline: OfflineReadiness | null;
}

const CANT_CHECK = "Can't check right now";

function setupLine(
  id: string,
  label: string,
  signals: readonly SetupReadinessSignal[],
  signalIds: readonly SetupReadinessSignalId[]
): ReadyLine {
  const hit = signals.find(signal => signalIds.includes(signal.id));
  return hit
    ? { id, label, status: 'fail', detail: hit.label, href: hit.href }
    : { id, label, status: 'pass' };
}

export function buildReadyForShowDay(input: ReadyForShowDayInput): ReadyForShowDay {
  const showId = input.setup.show.id;
  // Premium signals are only meaningful with the fresh publish read; without it the signal
  // function would fall back to the replicated show row, which lacks those columns.
  const signals = computeSetupReadinessSignals({
    ...input.setup,
    // Rosters are not threaded here: "judges assigned to every class" is the per-class rule.
    judges: [],
    ...(input.premiumInfo ? { premiumInfo: input.premiumInfo } : {}),
  });

  const premiumLine: ReadyLine = input.premiumInfo
    ? setupLine('premium', 'Premium published and current', signals, [
        'exhibitor-materials-unpublished',
        'landing-content-unpublished',
      ])
    : {
        id: 'premium',
        label: 'Premium published and current',
        status: 'unknown',
        detail: CANT_CHECK,
      };

  const pending = input.entryBreakdownByClassId ? sumPending(input.entryBreakdownByClassId) : null;
  const entriesLine: ReadyLine =
    pending === null
      ? { id: 'entries', label: 'Entries reviewed', status: 'unknown', detail: CANT_CHECK }
      : pending > 0
        ? {
            id: 'entries',
            label: 'Entries reviewed',
            status: 'fail',
            detail: `${pending} ${pending === 1 ? 'entry is' : 'entries are'} waiting for review`,
            href: getEntryManagementHref({ showId, attention: 'pending', mode: 'review' }),
          }
        : { id: 'entries', label: 'Entries reviewed', status: 'pass' };

  const paperworkBase = { id: 'paperwork', label: 'Check-in sheets and score sheets printed' };
  const paperworkLine: ReadyLine =
    input.paperwork.status === 'pass'
      ? { ...paperworkBase, status: 'pass' }
      : input.paperwork.status === 'unknown'
        ? { ...paperworkBase, status: 'unknown', detail: CANT_CHECK }
        : {
            ...paperworkBase,
            status: 'fail',
            detail: `${input.paperwork.outstanding} sheet${input.paperwork.outstanding === 1 ? '' : 's'} for the first day ${input.paperwork.outstanding === 1 ? 'needs' : 'need'} printing`,
            href: getShowHomeHref({
              showId,
              state: { filter: 'all', selectedDay: earliestTrialDate(input.setup.trials) },
            }),
          };

  const offlineBase = { id: 'offline', label: 'This device is ready to work offline' };
  const offlineLine: ReadyLine = !input.offline
    ? { ...offlineBase, status: 'unknown', detail: CANT_CHECK }
    : input.offline.ready
      ? { ...offlineBase, status: 'pass' }
      : {
          ...offlineBase,
          status: 'fail',
          detail:
            'This device is not saved for offline use. Use the Offline ready button at the top of the page.',
        };

  const lines: ReadyLine[] = [
    setupLine('setup', 'Show details, trials and classes complete', signals, [
      'show-details-missing',
      'no-trials',
      'no-classes',
    ]),
    setupLine('judges', 'Judges assigned to every class', signals, ['judges-missing']),
    premiumLine,
    setupLine('visible', 'Show visible to exhibitors', signals, ['show-not-visible']),
    entriesLine,
    paperworkLine,
    offlineLine,
  ];
  return { lines, allClear: lines.every(line => line.status === 'pass') };
}
