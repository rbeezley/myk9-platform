/**
 * The lines of the Results tab's "Finish the show" list (MYK9-1945, phase 2).
 *
 * Every line is read from {@link WhatIsLeft}: this file words and links them, and counts nothing.
 * A line that opens the class list carries the key the list filters by, so the link lands on
 * exactly the classes the line counted.
 */
import { judgeSignOffWording } from '@/features/show-map/judgeSignOff';
import { getResultsStepHref, getFinishLineHref } from '@/features/results-tab/resultsTabRoutes';
import type { WhatIsLeft, WhatIsLeftLine } from './whatIsLeft';

export interface FinishListItem {
  key: string;
  /** `open` = something left, `done` = a tick, `unknown` = this screen cannot say. */
  state: 'open' | 'done' | 'unknown';
  label: string;
  href: string;
}

function itemFor(
  showId: string,
  line: WhatIsLeftLine,
  releasedAndInitialed: boolean
): FinishListItem | null {
  const count = line.count ?? 0;
  const base = { key: line.key, href: getFinishLineHref(showId, line.key) };
  const state = line.open === null ? 'unknown' : line.open ? 'open' : 'done';
  switch (line.kind) {
    case 'unreleased':
      if (line.open === null) return null;
      return {
        ...base,
        state,
        label: line.open ? line.label : 'Every class is released',
      };
    case 'to-print':
      if (line.open === null) return null;
      return {
        ...base,
        state,
        label: line.open ? line.label : 'Results printed for every released class',
      };
    case 'judge-sign-off': {
      // "Collected" is only true once every class that ran is through, not while some are unreleased.
      if (line.open === null || (line.open === false && !releasedAndInitialed)) return null;
      const wording = judgeSignOffWording(line.registryId);
      return {
        ...base,
        state,
        label: line.open ? wording.pendingSignalLabel(count) : line.label,
      };
    }
    case 'results-submission':
      return {
        key: line.key,
        state,
        href: getResultsStepHref(showId, 'submit'),
        label: line.open === false ? line.label : `Submit to ${line.registryId ?? 'the registry'}`,
      };
    default:
      return null;
  }
}

/**
 * The list a secretary works down after the last class: the lines this screen can answer from its
 * classes, then the close step. Lines the screen cannot read (refunds, incidents) are not shown
 * here, and a line of `unknown` never claims a tick.
 */
export function buildFinishList(showId: string, left: WhatIsLeft): FinishListItem[] {
  const items = left.lines
    .map(line => itemFor(showId, line, left.releasedAndInitialed))
    .filter((item): item is FinishListItem => item !== null);
  items.push({
    key: 'close',
    state: 'open',
    label: 'Close the show',
    href: getResultsStepHref(showId, 'close'),
  });
  return items;
}
