import type { HydratedAccountTodayEntry } from '@/features/show-today/showTodayBanner.helpers';

const STORAGE_KEY_PREFIX = 'my_entries';

/**
 * Serializable ownership snapshot for one (show, user) pair. Entry ids are the
 * match key everywhere downstream — armbands can collide across trials, so they
 * are deliberately NOT part of this contract.
 */
export interface MyAtShowEntrySets {
  entryIds: string[];
  classIds: string[];
}

export const EMPTY_MY_ENTRY_SETS: MyAtShowEntrySets = { entryIds: [], classIds: [] };

/**
 * Keyed by user as well as show: the persisted snapshot drives "this dog is
 * YOURS" highlighting, so a device shared between accounts must never replay
 * the previous user's dogs.
 */
export function buildMyEntriesStorageKey(showId: string, userId: string): string {
  return `${STORAGE_KEY_PREFIX}_${showId}_${userId}`;
}

export function deriveMyAtShowEntrySets(
  entries: HydratedAccountTodayEntry[],
  showId: string
): MyAtShowEntrySets {
  const entryIds = new Set<string>();
  const classIds = new Set<string>();
  for (const entry of entries) {
    if (entry.showId !== showId) continue;
    entryIds.add(entry.entryId);
    if (entry.classId) classIds.add(entry.classId);
  }
  return { entryIds: Array.from(entryIds), classIds: Array.from(classIds) };
}

export function readMyAtShowEntries(showId: string, userId: string): MyAtShowEntrySets {
  try {
    const stored = localStorage.getItem(buildMyEntriesStorageKey(showId, userId));
    if (!stored) return EMPTY_MY_ENTRY_SETS;
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== 'object' || parsed === null) return EMPTY_MY_ENTRY_SETS;
    const candidate = parsed as Partial<MyAtShowEntrySets>;
    const onlyStrings = (values: unknown): string[] =>
      Array.isArray(values) ? values.filter((v): v is string => typeof v === 'string') : [];
    return { entryIds: onlyStrings(candidate.entryIds), classIds: onlyStrings(candidate.classIds) };
  } catch {
    return EMPTY_MY_ENTRY_SETS;
  }
}

/**
 * Overwrite-if-changed (NOT merge, unlike class favorites): a fresh RPC result
 * is authoritative, so a scratched/moved entry must drop out of the snapshot.
 * Returns whether storage was written.
 */
export function persistMyAtShowEntries(
  showId: string,
  userId: string,
  sets: MyAtShowEntrySets
): boolean {
  const existing = readMyAtShowEntries(showId, userId);
  const sameMembers = (a: string[], b: string[]) => {
    if (a.length !== b.length) return false;
    const bSet = new Set(b);
    return a.every(value => bSet.has(value));
  };
  if (
    sameMembers(sets.entryIds, existing.entryIds) &&
    sameMembers(sets.classIds, existing.classIds)
  ) {
    return false;
  }
  localStorage.setItem(buildMyEntriesStorageKey(showId, userId), JSON.stringify(sets));
  return true;
}
