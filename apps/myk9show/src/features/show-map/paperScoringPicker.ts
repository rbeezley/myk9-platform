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

/** Lower sorts first: partly scored, then untouched, then empty, then finished. */
function rank(cls: ShowMapClassInput): number {
  const { entryCount, scoredCount } = cls;
  if (typeof entryCount !== 'number' || typeof scoredCount !== 'number') return 1;
  if (entryCount === 0) return 2;
  if (scoredCount >= entryCount || cls.status === CLASS_STATUS.COMPLETED) return 3;
  return scoredCount > 0 ? 0 : 1;
}

function progressText(cls: ShowMapClassInput): string {
  if (typeof cls.entryCount !== 'number' || typeof cls.scoredCount !== 'number')
    return 'Progress unavailable';
  if (cls.entryCount === 0) return 'No entries';
  return `${cls.scoredCount} of ${cls.entryCount} scored`;
}

/**
 * Classes of the show grouped by trial (in the order given), each group sorted
 * so unfinished work leads and completed classes trail but stay selectable.
 * Cancelled classes are not scoreable and are left out.
 */
export function buildPaperScoringPicker(
  classes: readonly ShowMapClassInput[]
): PaperScoringPickerGroup[] {
  const live = classes.filter(cls => cls.status !== CLASS_STATUS.CANCELLED);
  const disambiguatorFor = buildClassDisambiguatorsByGroup(live, cls => cls.trialId);
  const groups = new Map<string, PaperScoringPickerGroup>();
  const byTrial = new Map<string, ShowMapClassInput[]>();
  for (const cls of live) {
    const list = byTrial.get(cls.trialId) ?? [];
    list.push(cls);
    byTrial.set(cls.trialId, list);
  }
  for (const [trialId, list] of byTrial) {
    const first = list[0]!;
    const title = formatTrialIdentity(first.trialName, first.trialNumber) ?? 'Trial';
    const date = first.trialDate ? formatDateOnly(first.trialDate) : '';
    const resolve = disambiguatorFor(trialId);
    const sorted = list
      .map((cls, index) => ({ cls, index }))
      .sort((a, b) => rank(a.cls) - rank(b.cls) || a.index - b.index)
      .map(({ cls }) => ({
        id: cls.id,
        label: buildFullClassLabel(cls, resolve(cls), cls.name),
        href: getPaperScoringClassHref(cls.id),
        progress: progressText(cls),
        done: rank(cls) === 3,
      }));
    groups.set(trialId, {
      trialId,
      label: date ? `${title} - ${date}` : title,
      classes: sorted,
    });
  }
  return [...groups.values()];
}
