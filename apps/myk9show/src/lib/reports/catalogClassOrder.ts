/**
 * MYK9-1009: the order the AKC marked catalog lists classes in.
 *
 * AKC Scent Work Regulations Ch.3 §37: all Container classes (Novice A, Novice B,
 * Advanced, Excellent, then Master, in that order), all Interior classes (same
 * order), all Exterior, all Buried, all Handler Discrimination (same order),
 * followed by the Detective Class -- regardless of run order. Within the show,
 * trials come in date then trial-number order.
 *
 * Element order is the registry's own element list (`akc.ts`, which is already
 * Container, Interior, Exterior, Buried, Handler Discrimination, Detective) and
 * level order is `levelProgressionRank`, so no second table exists. Anything
 * unknown sorts last, and ties keep their input order.
 */
import { levelProgressionRank } from '@/features/premium/pdf/bodies/classOrder';
import { getScentWorkSport } from '@/features/registries/scentWork';
import { isValidSection } from './reportUtils';

interface OrderableClass {
  trialId: string;
  element: string;
  level: string;
  section?: string | null | undefined;
}

interface OrderableTrial {
  id: string;
  date: string;
  trialNumber: string;
}

const UNKNOWN_RANK = Number.MAX_SAFE_INTEGER;

let akcElementLabels: string[] | null = null;

function elementRank(element: string): number {
  akcElementLabels ??= getScentWorkSport('AKC').elements.map(item => item.label.toLowerCase());
  const index = akcElementLabels.indexOf(element.trim().toLowerCase());
  return index === -1 ? UNKNOWN_RANK : index;
}

function trialOrder(trials: readonly OrderableTrial[]): Map<string, number> {
  const sorted = [...trials].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.trialNumber.localeCompare(b.trialNumber, undefined, { numeric: true })
  );
  return new Map(sorted.map((trial, index) => [trial.id, index]));
}

/** The classes in §37 order. Pure: returns a new array. */
export function sortClassesForAkcCatalog<T extends OrderableClass>(
  classes: readonly T[],
  trials: readonly OrderableTrial[]
): T[] {
  const trialRank = trialOrder(trials);
  return classes
    .map((cls, index) => ({ cls, index }))
    .sort((a, b) => {
      const trialDiff =
        (trialRank.get(a.cls.trialId) ?? UNKNOWN_RANK) -
        (trialRank.get(b.cls.trialId) ?? UNKNOWN_RANK);
      if (trialDiff !== 0) return trialDiff;
      const elementDiff = elementRank(a.cls.element) - elementRank(b.cls.element);
      if (elementDiff !== 0) return elementDiff;
      const levelDiff =
        levelProgressionRank(a.cls.level, 'AKC') - levelProgressionRank(b.cls.level, 'AKC');
      if (levelDiff !== 0) return levelDiff;
      // Novice A before Novice B; a class with no section sorts before a lettered one.
      const aSection = isValidSection(a.cls.section) ? a.cls.section!.trim() : '';
      const bSection = isValidSection(b.cls.section) ? b.cls.section!.trim() : '';
      return aSection.localeCompare(bSection) || a.index - b.index;
    })
    .map(item => item.cls);
}
