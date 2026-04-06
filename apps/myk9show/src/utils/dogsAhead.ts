import type { ShowDayClass } from '@/types/show-day-types';

/**
 * Returns the number of unscored dogs running before the exhibitor,
 * or null if the entry is already scored or has no run order.
 *
 * Why -1: the exhibitor's own position counts as one of the "scored + 1" slots;
 * we want the count of dogs *ahead*, not the position index.
 */
export function computeDogsAhead(classData: ShowDayClass): number | null {
  if (classData.isScored || classData.myRunningOrder == null) return null;
  return Math.max(0, classData.myRunningOrder - classData.scoredEntries - 1);
}

export function formatDogsAheadText(dogsAhead: number | null): string | null {
  if (dogsAhead === null) return null;
  if (dogsAhead === 0) return "You're next";
  if (dogsAhead === 1) return '1 dog ahead';
  return `${dogsAhead} dogs ahead`;
}
