/**
 * Tabs, search and sort for the at-show class picker (MYK9-1506, v3 parity).
 *
 * Pure functions over the `ClassEntry` list the page already builds, so they work
 * offline and are tested without mounting the page. The tab is decided from
 * `getEffectiveClassStatus`, the same status the card renders, so a card can never
 * sit under a tab that disagrees with its badge.
 */
import { getEffectiveClassStatus, type ClassEntry } from '@myk9/ringside';

export type ClassListTab = 'pending' | 'in-progress' | 'favorites' | 'completed';
export type ClassListSort = 'run-order' | 'element-level' | 'level-element';

export const CLASS_LIST_TABS: readonly { id: ClassListTab; label: string }[] = [
  { id: 'pending', label: 'Pending' },
  { id: 'in-progress', label: 'In Progress' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'completed', label: 'Completed' },
];

export const CLASS_LIST_SORTS: readonly { id: ClassListSort; label: string }[] = [
  { id: 'run-order', label: 'Run Order' },
  { id: 'element-level', label: 'Element → Level' },
  { id: 'level-element', label: 'Level → Element' },
];

export const DEFAULT_CLASS_LIST_TAB: ClassListTab = 'pending';
export const DEFAULT_CLASS_LIST_SORT: ClassListSort = 'run-order';

export function isClassListTab(value: unknown): value is ClassListTab {
  return CLASS_LIST_TABS.some(tab => tab.id === value);
}

export function isClassListSort(value: unknown): value is ClassListSort {
  return CLASS_LIST_SORTS.some(sort => sort.id === value);
}

/** Whether a card belongs under a tab. Pending is "not completed" (v3), so it includes live classes. */
export function classMatchesTab(entry: ClassEntry, tab: ClassListTab): boolean {
  const status = getEffectiveClassStatus(entry);
  switch (tab) {
    case 'pending':
      return status !== 'completed';
    case 'in-progress':
      return status === 'in-progress' || status === 'offline-scoring';
    case 'favorites':
      return entry.is_favorite;
    case 'completed':
      return status === 'completed';
  }
}

export function countByTab(entries: readonly ClassEntry[]): Record<ClassListTab, number> {
  const counts: Record<ClassListTab, number> = {
    pending: 0,
    'in-progress': 0,
    favorites: 0,
    completed: 0,
  };
  for (const entry of entries) {
    for (const { id } of CLASS_LIST_TABS) {
      if (classMatchesTab(entry, id)) counts[id] += 1;
    }
  }
  return counts;
}

/** Name, element, level, judge and section, case-insensitive; every word must match somewhere. */
export function classMatchesSearch(entry: ClassEntry, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = [entry.class_name, entry.element, entry.level, entry.judge_name, entry.section]
    .join(' ')
    .toLowerCase();
  return words.every(word => haystack.includes(word));
}

const LEVEL_RANK = ['novice', 'advanced', 'excellent', 'master', 'elite', 'summit'];

function levelRank(level: string): number {
  const index = LEVEL_RANK.indexOf(level.trim().toLowerCase());
  return index === -1 ? LEVEL_RANK.length : index;
}

function compareLevels(a: ClassEntry, b: ClassEntry): number {
  return levelRank(a.level) - levelRank(b.level) || a.level.localeCompare(b.level);
}

function compareElements(a: ClassEntry, b: ClassEntry): number {
  return a.element.localeCompare(b.element);
}

function compareRunOrder(a: ClassEntry, b: ClassEntry): number {
  return a.class_order - b.class_order || a.class_name.localeCompare(b.class_name);
}

/**
 * Sort one trial's cards. Run Order returns the list untouched: the page's scan
 * order (favorites and live rings first) is the run order, and re-sorting it here
 * would drop that.
 */
export function sortClassCards(entries: ClassEntry[], sort: ClassListSort): ClassEntry[] {
  if (sort === 'run-order') return entries;
  const primary = sort === 'element-level' ? compareElements : compareLevels;
  const secondary = sort === 'element-level' ? compareLevels : compareElements;
  return [...entries].sort(
    (a, b) =>
      primary(a, b) ||
      secondary(a, b) ||
      a.section.localeCompare(b.section) ||
      compareRunOrder(a, b)
  );
}
