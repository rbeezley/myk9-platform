/**
 * Title Tracking Engine — pure computation, no side effects.
 *
 * Computes title progress from qualifying legs (platform-scored + manual results)
 * against seeded sport title definitions.
 */
import type { SportTitleRow } from '@/types/sport-template-types';
import type { ExhibitorResult } from '@/hooks/queries/useExhibitorResults';
import type { ManualResult } from '@/types/manual-result-types';

// ========================================
// TYPES
// ========================================

export interface QualifyingLeg {
  id: string;
  source: 'platform' | 'manual';
  element: string;
  level: string;
  trial_date: string;
  show_name: string;
  judge?: string | null;
  notes?: string | null;
}

export interface TitleProgressResult {
  titleId: string;
  abbreviation: string;
  fullName: string;
  titleType: SportTitleRow['title_type'];
  sportTemplateId: string;
  earnedLegs: number;
  requiredLegs: number;
  percentage: number;
  isEarned: boolean;
  earnedDate: string | null;
  requiredElementTitles: string[];
  earnedElementTitles: string[];
  prerequisiteMet: boolean;
  isSuperseded: boolean;
  legs: QualifyingLeg[];
  sortOrder: number;
}

// ========================================
// LEG MAPPING HELPERS
// ========================================

export function mapExhibitorResultToLeg(result: ExhibitorResult): QualifyingLeg | null {
  if (result.resultStatus !== 'qualified') return null;
  if (!result.classElement || !result.classLevel) return null;

  return {
    id: result.id,
    source: 'platform',
    element: result.classElement,
    level: result.classLevel,
    trial_date: result.showDate,
    show_name: result.showName,
  };
}

export function mapManualResultToLeg(result: ManualResult): QualifyingLeg | null {
  if (result.result_status !== 'qualified') return null;

  return {
    id: result.id,
    source: 'manual',
    element: result.element,
    level: result.level,
    trial_date: result.trial_date,
    show_name: result.show_name,
    judge: result.judge,
    notes: result.notes,
  };
}

// ========================================
// LEVEL INFERENCE
// ========================================

/**
 * Infer the level from a title's full_name by matching against the sport's levels.
 * E.g. "Scent Work Container Novice" with levels ["Novice","Advanced","Excellent","Master"]
 * returns "Novice".
 */
export function inferLevelFromTitle(title: SportTitleRow, sortedLevels: string[]): string | null {
  const name = title.full_name;
  // sortedLevels should already be sorted longest-first by the caller
  for (const level of sortedLevels) {
    if (name.includes(level)) return level;
  }
  return null;
}

// ========================================
// CORE ENGINE
// ========================================

export function computeTitleProgress(
  legs: QualifyingLeg[],
  titles: SportTitleRow[],
  levels: string[]
): TitleProgressResult[] {
  // Pre-sort levels longest-first once (avoids re-sorting per inferLevelFromTitle call)
  const sortedLevels = [...levels].sort((a, b) => b.length - a.length);

  // Step 1: Index legs by element::level
  const legIndex = new Map<string, QualifyingLeg[]>();
  for (const leg of legs) {
    const key = `${leg.element}::${leg.level}`;
    const existing = legIndex.get(key) || [];
    existing.push(leg);
    legIndex.set(key, existing);
  }
  // Sort each bucket by date
  for (const [, bucket] of legIndex) {
    bucket.sort((a, b) => a.trial_date.localeCompare(b.trial_date));
  }

  // Build a map of titleId → TitleProgressResult for cross-referencing
  const progressMap = new Map<string, TitleProgressResult>();

  // Step 2: Process element/elite/continuation titles (required_legs > 0, single element)
  for (const title of titles) {
    if (title.required_legs <= 0) continue;

    const inferredLevel = inferLevelFromTitle(title, sortedLevels);
    const isMultiElement = title.required_elements.length > 1;

    let matchingLegs: QualifyingLeg[] = [];

    if (isMultiElement) {
      // Multi-element titles with legs (UKC champions/grand champions)
      // Count total Qs across ALL required elements at the inferred level
      for (const element of title.required_elements) {
        const key = `${element}::${inferredLevel}`;
        const bucket = legIndex.get(key) || [];
        matchingLegs = matchingLegs.concat(bucket);
      }
      matchingLegs.sort((a, b) => a.trial_date.localeCompare(b.trial_date));
    } else if (title.required_elements.length === 1) {
      // Single-element: element/elite/continuation
      const element = title.required_elements[0];
      const key = `${element}::${inferredLevel}`;
      matchingLegs = legIndex.get(key) || [];
    }

    const earnedLegs = matchingLegs.length;
    const isEarned = earnedLegs >= title.required_legs;
    const earnedDate = isEarned ? matchingLegs[title.required_legs - 1].trial_date : null;

    progressMap.set(title.id, {
      titleId: title.id,
      abbreviation: title.abbreviation,
      fullName: title.full_name,
      titleType: title.title_type,
      sportTemplateId: title.sport_template_id,
      earnedLegs,
      requiredLegs: title.required_legs,
      percentage:
        title.required_legs > 0
          ? Math.min(100, Math.round((earnedLegs / title.required_legs) * 100))
          : 0,
      isEarned,
      earnedDate,
      requiredElementTitles: [],
      earnedElementTitles: [],
      prerequisiteMet: true, // Will be updated in step 5
      isSuperseded: false, // Will be updated in step 6
      legs: matchingLegs.slice(0, isEarned ? title.required_legs : matchingLegs.length),
      sortOrder: title.sort_order,
    });
  }

  // Step 3: Process level titles (required_legs === 0, check sub-title completion)
  for (const title of titles) {
    if (title.required_legs !== 0) continue;

    const inferredLevel = inferLevelFromTitle(title, sortedLevels);

    // Find the element titles that correspond to each required_element at this level
    // Cache sub-title lookups to avoid calling findMatchingSubTitle twice per element
    const requiredElementTitleIds: string[] = [];
    const earnedElementTitleIds: string[] = [];
    const subTitleByElement = new Map<string, SportTitleRow>();

    for (const element of title.required_elements) {
      const subTitle = findMatchingSubTitle(title, element, inferredLevel, titles, sortedLevels);
      if (subTitle) {
        subTitleByElement.set(element, subTitle);
        requiredElementTitleIds.push(subTitle.abbreviation);
        const subProgress = progressMap.get(subTitle.id);
        if (subProgress?.isEarned) {
          earnedElementTitleIds.push(subTitle.abbreviation);
        }
      }
    }

    const allEarned =
      requiredElementTitleIds.length > 0 &&
      earnedElementTitleIds.length === requiredElementTitleIds.length;

    // Earned date = max of sub-title earned dates
    let earnedDate: string | null = null;
    if (allEarned) {
      for (const element of title.required_elements) {
        const subTitle = subTitleByElement.get(element);
        if (subTitle) {
          const subProgress = progressMap.get(subTitle.id);
          if (subProgress?.earnedDate) {
            if (!earnedDate || subProgress.earnedDate > earnedDate) {
              earnedDate = subProgress.earnedDate;
            }
          }
        }
      }
    }

    const percentage =
      requiredElementTitleIds.length > 0
        ? Math.round((earnedElementTitleIds.length / requiredElementTitleIds.length) * 100)
        : 0;

    progressMap.set(title.id, {
      titleId: title.id,
      abbreviation: title.abbreviation,
      fullName: title.full_name,
      titleType: title.title_type,
      sportTemplateId: title.sport_template_id,
      earnedLegs: earnedElementTitleIds.length,
      requiredLegs: requiredElementTitleIds.length,
      percentage,
      isEarned: allEarned,
      earnedDate,
      requiredElementTitles: requiredElementTitleIds,
      earnedElementTitles: earnedElementTitleIds,
      prerequisiteMet: true,
      isSuperseded: false,
      legs: [],
      sortOrder: title.sort_order,
    });
  }

  // Step 5: Evaluate prerequisites
  for (const title of titles) {
    if (!title.prerequisite_title_id) continue;
    const progress = progressMap.get(title.id);
    if (!progress) continue;

    const prereqProgress = progressMap.get(title.prerequisite_title_id);
    progress.prerequisiteMet = prereqProgress?.isEarned ?? false;
  }

  // Step 6: Apply supersession
  for (const title of titles) {
    if (!title.supersedes_title_ids || title.supersedes_title_ids.length === 0) continue;
    const progress = progressMap.get(title.id);
    if (!progress?.isEarned) continue;

    for (const supersededId of title.supersedes_title_ids) {
      const superseded = progressMap.get(supersededId);
      if (superseded) {
        superseded.isSuperseded = true;
      }
    }
  }

  // Step 7: Sort results
  const results = Array.from(progressMap.values());
  results.sort((a, b) => {
    const aCategory = getSortCategory(a);
    const bCategory = getSortCategory(b);
    if (aCategory !== bCategory) return aCategory - bCategory;
    return a.sortOrder - b.sortOrder;
  });

  return results;
}

// ========================================
// HELPERS
// ========================================

/**
 * Find the sub-title matching a given element at the inferred level for a level/champion title.
 *
 * For basic level titles (title_type='level'), look for 'element' sub-titles.
 * For champion level titles (title_type='champion'), look for 'elite' sub-titles.
 */
function findMatchingSubTitle(
  parentTitle: SportTitleRow,
  element: string,
  inferredLevel: string | null,
  allTitles: SportTitleRow[],
  sortedLevels: string[]
): SportTitleRow | undefined {
  const subTitleType = getSubTitleType(parentTitle.title_type);

  return allTitles.find(t => {
    if (t.sport_template_id !== parentTitle.sport_template_id) return false;
    if (t.title_type !== subTitleType) return false;
    if (t.required_elements.length !== 1) return false;
    if (t.required_elements[0] !== element) return false;
    const tLevel = inferLevelFromTitle(t, sortedLevels);
    return tLevel === inferredLevel;
  });
}

function getSubTitleType(parentType: SportTitleRow['title_type']): string {
  switch (parentType) {
    case 'level':
      return 'element';
    case 'champion':
      return 'elite';
    default:
      return 'element';
  }
}

/**
 * Sort category:
 * 0 = in-progress (not earned, prerequisite met, has some legs)
 * 1 = next-eligible (prerequisite met, no legs yet)
 * 2 = earned (not superseded)
 * 3 = earned + superseded
 * 4 = locked (prerequisite not met)
 */
function getSortCategory(p: TitleProgressResult): number {
  if (!p.prerequisiteMet) return 4;
  if (p.isEarned && p.isSuperseded) return 3;
  if (p.isEarned) return 2;
  if (p.earnedLegs > 0) return 0;
  return 1;
}
