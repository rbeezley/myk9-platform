/**
 * Facts a group of class rows all agree on, so the card can state them once
 * above the list instead of once per row.
 *
 * A single-dog, single-trial, three-class order used to print the trial date
 * four times, the trial number three times and the handler three times. The
 * repetition carried no information: it was the SAME fact re-stated because
 * each row rendered independently. This module answers "do they all agree?"
 * so `MyEntryCardDetails` can hoist what they share and leave a row to print
 * only what makes it different.
 *
 * @module MyEntriesPage/modules/classGroupFacts
 */

import type { EntryClass } from './my-entries-types';

export interface SharedClassFacts {
  /** Present only when every row carries the same trial date. */
  trialDate?: Date | undefined;
  /** Present only when every row carries the same trial number. */
  trialNumber?: string | undefined;
  /** Present only when every row carries the same handler. */
  handler?: string | undefined;
}

/**
 * Reduce `values` to the single value they all share, or `undefined` if any
 * is missing or differs. `undefined` is a disagreement, never a wildcard —
 * a row that does not carry the fact cannot be described by another row's.
 */
function sharedValue<T>(values: (T | undefined)[], eq: (a: T, b: T) => boolean): T | undefined {
  if (values.length === 0) return undefined;
  const [first, ...rest] = values;
  if (first === undefined) return undefined;
  return rest.every(v => v !== undefined && eq(first, v)) ? first : undefined;
}

/**
 * The facts every class in `classes` agrees on.
 *
 * An `unresolved` row (its class join has not replicated yet) is treated as a
 * disagreement rather than skipped: it does not know its own trial, so
 * hoisting a sibling's value would state that value as this row's fact too.
 */
export function getSharedClassFacts(classes: EntryClass[]): SharedClassFacts {
  if (classes.length === 0) return {};
  if (classes.some(cls => cls.unresolved)) return {};

  const trialDate = sharedValue(
    classes.map(cls => cls.trialDate),
    (a, b) => a.getTime() === b.getTime()
  );
  const trialNumber = sharedValue(
    classes.map(cls => cls.trialNumber),
    (a, b) => a === b
  );
  const handler = sharedValue(
    classes.map(cls => cls.handler),
    (a, b) => a === b
  );

  return {
    ...(trialDate ? { trialDate } : {}),
    ...(trialNumber ? { trialNumber } : {}),
    ...(handler ? { handler } : {}),
  };
}
