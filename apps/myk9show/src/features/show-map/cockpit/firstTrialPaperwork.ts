import { getTrialTimezone } from '@/features/registries';

import type { SecretaryCockpitPaperwork } from './secretaryCockpitTypes';
import { orderTrials, trialLabelOf, type OrderableTrial } from './trialStanding';

/**
 * The night-before line "First trial's paperwork printed" (MYK9-2075, owner-approved mock-up in
 * docs/plan-print-packets.md): measures the first trial's check-in sheets and score sheets plus the
 * first day's armband labels, one label per dog, in four states. Pure: it reads the paperwork map
 * other modules computed. Wording is in `firstTrialLineText.ts`.
 */

export interface PaperworkTrial {
  id: string;
  trialDate: string;
  trialNumber?: string | number | null | undefined;
  plannedStartTime?: string | null | undefined;
  /** The trials.display_order column as stored. */
  order?: string | number | null | undefined;
  timezone?: string | null | undefined;
  name?: string | null | undefined;
}

export interface PaperworkClass {
  id: string;
  trialId?: string | null;
  name?: string | null | undefined;
  element?: string | null | undefined;
  level?: string | null | undefined;
  judgeName?: string | null | undefined;
  /** The class status as stored: a cancelled class never prints, so it is not measured. */
  status?: string | null | undefined;
}

export type PaperworkRows = ReadonlyMap<string, readonly SecretaryCockpitPaperwork[]>;

/** The before-class print items of the per-class checklist (classChecklist.ts). */
const PRE_SHOW_SHEETS: ReadonlySet<string> = new Set(['check-in-sheet', 'scoresheet']);
const ARMBAND_LABELS = 'armband-labels';

export type FirstTrialPaperworkKind = 'not-printed' | 'changed' | 'printed' | 'unknown';

export interface FirstDayPaperwork {
  status: 'pass' | 'fail' | 'unknown';
  kind: FirstTrialPaperworkKind;
  /** Sheets of the first trial not printed or changed since printing. */
  sheets: number;
  /** The first trial's judge packets that still need printing (judge names folded and trimmed). */
  judgePackets: number;
  /** Distinct dogs on the first day whose label was never printed. */
  labelsNotPrinted: number;
  /** Distinct dogs on the first day whose label was printed and has changed. */
  labelsChanged: number;
  /** Classes of the first trial whose sheets changed since printing, by class id. */
  changedClasses: readonly { id: string; name: string }[];
  /** The first first-day class with a label to print: where the day's labels print. */
  labelDoorClassId: string | null;
  /** The newest print of the first trial's sheets, as given; null when there is none to name. */
  printedAt: string | null;
  /** The line measured at least one sheet or label row. */
  measured: boolean;
  firstTrial: { id: string; label: string; date: string; timeZone: string } | null;
  laterTrials: readonly { label: string; number: number | null; date: string }[];
}

const EMPTY: FirstDayPaperwork = {
  status: 'unknown',
  kind: 'unknown',
  sheets: 0,
  judgePackets: 0,
  labelsNotPrinted: 0,
  labelsChanged: 0,
  changedClasses: [],
  labelDoorClassId: null,
  printedAt: null,
  measured: false,
  firstTrial: null,
  laterTrials: [],
};

export const readOrderable = (trial: PaperworkTrial): OrderableTrial => ({
  id: trial.id,
  date: trial.trialDate,
  number: trial.trialNumber,
  plannedStartTime: trial.plannedStartTime,
  displayOrder: trial.order,
  name: trial.name,
});

export function classDisplayName(cls: PaperworkClass): string {
  const composed = [cls.element, cls.level].filter(Boolean).join(' ');
  return composed || cls.name || 'A class';
}

/**
 * Rolls the per-class paperwork map up to what the night before needs: the first trial's sheets and
 * the first day's labels. Later trials print after move-ups, so they are not measured. Unknown wins
 * over everything: with any row in what the line measures unreadable, nothing is called printed or
 * unprinted. Labels are counted per dog from the rows' `labelsToPrint`, never per class.
 */
export function rollUpFirstDayPaperwork(input: {
  trials: readonly PaperworkTrial[];
  classes: readonly PaperworkClass[];
  byClassId: PaperworkRows;
  available: boolean;
}): FirstDayPaperwork {
  const sorted = orderTrials(
    input.trials.filter(trial => trial.trialDate),
    readOrderable
  );
  const first = sorted[0];
  if (!input.available || !first) return EMPTY;
  const firstDayTrials = new Set(
    sorted.filter(trial => trial.trialDate === first.trialDate).map(trial => trial.id)
  );
  let sheetsNotPrinted = 0;
  let sheetsChanged = 0;
  let unknown = false;
  let measured = false;
  let newestPrint: { at: string; time: number } | null = null;
  const labelsNotPrinted = new Set<string>();
  const labelsChanged = new Set<string>();
  const judges = new Set<string>();
  const changedClasses = new Map<string, string>();
  let labelDoorClassId: string | null = null;
  for (const classItem of input.classes) {
    if (!classItem.trialId || !firstDayTrials.has(classItem.trialId)) continue;
    if (/^cancel+ed$/.test(classItem.status?.trim().toLowerCase() ?? '')) continue;
    for (const row of input.byClassId.get(classItem.id) ?? []) {
      const isSheet = PRE_SHOW_SHEETS.has(row.reportId) && classItem.trialId === first.id;
      if (!isSheet && row.reportId !== ARMBAND_LABELS) continue;
      measured = true;
      if (row.state === 'unknown') {
        unknown = true;
        continue;
      }
      if (!isSheet) {
        const { notPrinted = [], changed = [] } = row.labelsToPrint ?? {};
        notPrinted.forEach(key => labelsNotPrinted.add(key));
        changed.forEach(key => labelsChanged.add(key));
        if (labelDoorClassId === null && notPrinted.length + changed.length > 0) {
          labelDoorClassId = classItem.id;
        }
        continue;
      }
      if (row.state === 'current') {
        const time = row.printedAt ? Date.parse(row.printedAt) : Number.NaN;
        if (!Number.isNaN(time) && (!newestPrint || time > newestPrint.time)) {
          newestPrint = { at: row.printedAt!, time };
        }
        continue;
      }
      judges.add((classItem.judgeName ?? '').trim().toLowerCase());
      if (row.state === 'stale') {
        sheetsChanged += 1;
        changedClasses.set(classItem.id, classDisplayName(classItem));
      } else {
        sheetsNotPrinted += 1;
      }
    }
  }
  // A dog whose label is both new in one class and changed in another counts once, as new.
  for (const key of labelsNotPrinted) labelsChanged.delete(key);
  const all = sorted.map(readOrderable);
  const firstTrial = {
    id: first.id,
    label: trialLabelOf(readOrderable(first), all),
    date: first.trialDate,
    timeZone: getTrialTimezone({ id: first.id, timezone: first.timezone ?? null }),
  };
  const laterTrials = sorted
    .filter(trial => trial.id !== first.id)
    .map(trial => {
      const label = trialLabelOf(readOrderable(trial), all);
      const match = /^Trial (\d+)$/.exec(label);
      return { label, number: match ? Number(match[1]) : null, date: trial.trialDate };
    });
  const base = {
    sheets: sheetsNotPrinted + sheetsChanged,
    judgePackets: judges.size,
    labelsNotPrinted: labelsNotPrinted.size,
    labelsChanged: labelsChanged.size,
    changedClasses: [...changedClasses].map(([id, name]) => ({ id, name })),
    labelDoorClassId,
    printedAt: newestPrint?.at ?? null,
    measured,
    firstTrial,
    laterTrials,
  };
  if (unknown) return { ...base, status: 'unknown', kind: 'unknown' };
  const unprinted = sheetsNotPrinted > 0 || labelsNotPrinted.size > 0;
  const changed = sheetsChanged > 0 || labelsChanged.size > 0;
  if (unprinted) return { ...base, status: 'fail', kind: 'not-printed' };
  if (changed) return { ...base, status: 'fail', kind: 'changed' };
  return { ...base, status: 'pass', kind: 'printed' };
}
