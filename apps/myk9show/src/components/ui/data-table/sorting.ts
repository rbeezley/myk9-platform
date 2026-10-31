import type { SortingFn } from '@tanstack/react-table';

/**
 * Level progression order for scent work classes.
 * Used as a custom TanStack Table sorting function.
 */
const LEVEL_ORDER = ['Introductory', 'Novice', 'Intermediate', 'Senior', 'Master', 'Champion'];

export const levelProgressionSort: SortingFn<unknown> = (rowA, rowB, columnId) => {
  const aVal = String(rowA.getValue(columnId) ?? '');
  const bVal = String(rowB.getValue(columnId) ?? '');
  const a = LEVEL_ORDER.indexOf(aVal);
  const b = LEVEL_ORDER.indexOf(bVal);
  // Unknown levels sort to the end
  const aIdx = a === -1 ? LEVEL_ORDER.length : a;
  const bIdx = b === -1 ? LEVEL_ORDER.length : b;
  return aIdx - bIdx;
};
