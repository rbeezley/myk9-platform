import { entryClassId, type ShowRegistrationGroup } from './showRegistrationProjection';

export interface EntryManagementFilterCounts {
  byClass: ReadonlyMap<string, number>;
  /** Absent until every class's trial is known; a partial map would undercount a trial. */
  byTrial?: ReadonlyMap<string, number>;
}

function increment(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

/**
 * Forms that match each Trial and Class value on its own, over the whole show (settled rule 7),
 * so a value never reads 0 because of another filter. A form counts once per value however many
 * of its entries are in it.
 */
export function countFormsByTrialAndClass(
  groups: readonly ShowRegistrationGroup[],
  classTrialById: ReadonlyMap<string, string> | undefined
): EntryManagementFilterCounts {
  const byClass = new Map<string, number>();
  const byTrial = new Map<string, number>();
  for (const group of groups) {
    const classIds = new Set(
      group.entries.flatMap(entry => entry.classes.map(entryClass => entryClassId(entryClass)))
    );
    classIds.forEach(classId => increment(byClass, classId));
    if (classTrialById) {
      const trialIds = new Set([...classIds].flatMap(classId => classTrialById.get(classId) ?? []));
      trialIds.forEach(trialId => increment(byTrial, trialId));
    }
  }
  return classTrialById ? { byClass, byTrial } : { byClass };
}
