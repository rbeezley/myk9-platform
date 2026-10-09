import { CLASS_STATUS } from '@myk9/core';

import {
  buildClassDisambiguatorsByGroup,
  buildFullClassLabel,
} from '@/features/_shared/classLabel';
import type { ShowMapClassInput } from './showMapTypes';
import { formatTrialIdentity } from '@/features/show-desk-people-roster/peopleRoster';
import { getPaperScoringClassHref } from '@/pages/scoring/scoringRoutes';
import { formatDateOnly } from '@/lib/format/dates';

export interface PaperScoringPickerClass {
  id: string;
  label: string;
  href: string;
  /** "3 of 12 scored", "No entries", or "Progress unavailable". */
  progress: string;
  done: boolean;
}

export interface PaperScoringPickerGroup {
  trialId: string;
  label: string;
  classes: PaperScoringPickerClass[];
}

export interface PaperScoringPicker {
  /** Unfinished classes, grouped by trial in the order given. */
  groups: PaperScoringPickerGroup[];
  /** Every finished class across all trials, each labelled with its trial. */
  finished: PaperScoringPickerClass[];
}

/** Lower sorts first: partly scored, then untouched, then empty, then finished. */
function rank(cls: ShowMapClassInput): number {
  const { entryCount, scoredCount } = cls;
  if (typeof entryCount !== 'number' || typeof scoredCount !== 'number') return 1;
  if (entryCount === 0) return 2;
  if (scoredCount >= entryCount || cls.status === CLASS_STATUS.COMPLETED) return 3;
  return scoredCount > 0 ? 0 : 1;
}

const FINISHED_RANK = 3;

function progressText(cls: ShowMapClassInput): string {
  if (typeof cls.entryCount !== 'number' || typeof cls.scoredCount !== 'number')
    return 'Progress unavailable';
  if (cls.entryCount === 0) return 'No entries';
  return `${cls.scoredCount} of ${cls.entryCount} scored`;
}

/**
 * The show's classes for paper scoring. Unfinished classes group by trial (in
 * the order given) with partly scored work leading; finished classes move out
 * of their trial into one list at the bottom, each labelled with its trial so
 * same-named classes stay distinguishable. Cancelled classes are left out.
 */
export function buildPaperScoringPicker(classes: readonly ShowMapClassInput[]): PaperScoringPicker {
  const live = classes.filter(cls => cls.status !== CLASS_STATUS.CANCELLED);
  const disambiguatorFor = buildClassDisambiguatorsByGroup(live, cls => cls.trialId);
  const byTrial = new Map<string, ShowMapClassInput[]>();
  for (const cls of live) {
    const list = byTrial.get(cls.trialId) ?? [];
    list.push(cls);
    byTrial.set(cls.trialId, list);
  }
  const groups: PaperScoringPickerGroup[] = [];
  const finished: PaperScoringPickerClass[] = [];
  for (const [trialId, list] of byTrial) {
    const first = list[0]!;
    const title = formatTrialIdentity(first.trialName, first.trialNumber) ?? 'Trial';
    const date = first.trialDate ? formatDateOnly(first.trialDate) : '';
    const label = date ? `${title} - ${date}` : title;
    const resolve = disambiguatorFor(trialId);
    const sorted = list
      .map((cls, index) => ({ cls, index, rank: rank(cls) }))
      .sort((a, b) => a.rank - b.rank || a.index - b.index);
    const toItem = (cls: ShowMapClassInput, rowRank: number): PaperScoringPickerClass => ({
      id: cls.id,
      label: buildFullClassLabel(cls, resolve(cls), cls.name),
      href: getPaperScoringClassHref(cls.id),
      progress: progressText(cls),
      done: rowRank === FINISHED_RANK,
    });
    const unfinished = sorted
      .filter(row => row.rank !== FINISHED_RANK)
      .map(row => toItem(row.cls, row.rank));
    if (unfinished.length > 0) groups.push({ trialId, label, classes: unfinished });
    for (const row of sorted) {
      if (row.rank !== FINISHED_RANK) continue;
      const item = toItem(row.cls, row.rank);
      finished.push({ ...item, label: `${item.label} · ${label}` });
    }
  }
  return { groups, finished };
}
