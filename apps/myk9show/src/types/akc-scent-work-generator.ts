import { GeneratedClass } from './class-template-types';
import { generateScentWorkClasses, getScentWorkSport } from '@/features/registries/scentWork';

// AKC customField prose per (element, level) — extracted verbatim from the prior inline
// generator. Keyed by canonical labels ('Master', 'Handler Discrimination').
function getGeneratedCustomFields(
  element: string,
  level: string | undefined
): Record<string, string> {
  if (element === 'Detective') {
    return {
      searchType: 'Unknown number',
      hideCount: 'Unknown',
      difficulty: 'Ultimate challenge - large search area incorporating interiors AND exteriors',
      distractionsRequired: 'Complex odor problems allowed',
      offLeashOption: 'true',
      special: 'Combines interior and exterior elements in one large search area',
    };
  }

  if (element === 'Handler Discrimination') {
    const known = level === 'Novice' || level === 'Advanced';
    return {
      searchType: known ? 'Known number' : 'Unknown number',
      hideCount: level === 'Novice' ? '1' : level === 'Advanced' ? '2' : 'Unknown',
      difficulty: 'Handler scent discrimination challenge',
      distractionsRequired: 'Per regulations',
      offLeashOption: 'true',
      special: 'Hide location changes between competitors',
    };
  }

  // Standard elements (Container/Interior/Exterior/Buried).
  switch (level) {
    case 'Novice':
      return {
        searchType: 'Known number',
        hideCount: '1',
        difficulty: 'Basic search - straightforward placement, no air movement challenges',
        distractionsRequired: 'Per regulations (varies by element)',
        offLeashOption: 'true',
      };
    case 'Advanced':
      return {
        searchType: 'Known number',
        hideCount: '2',
        difficulty: 'Two relatively simple hides, minimal converging odor',
        distractionsRequired: 'Per regulations (varies by element)',
        offLeashOption: 'true',
      };
    case 'Excellent':
      return {
        searchType: element === 'Interior' ? 'Unknown number' : 'Known number',
        hideCount: element === 'Interior' ? 'Unknown (1-3)' : 'Variable',
        difficulty: 'Complex search, inaccessible hides introduced, basic converging odor',
        distractionsRequired: 'Per regulations (varies by element)',
        offLeashOption: 'true',
      };
    case 'Master':
      return {
        searchType: 'Unknown number',
        hideCount: 'Unknown',
        difficulty: 'Complex search testing teamwork, time management, efficiency',
        distractionsRequired: 'Per regulations (varies by element)',
        offLeashOption: 'true',
      };
    default:
      return {};
  }
}

// Official AKC Scent Work class generator. Structure comes from the AKC registry (the single
// source of truth, via generateScentWorkClasses); this attaches the per-class customField prose.
// Canonical labels ('Master', 'Handler Discrimination') and registry order.
export function generateAKCScentWorkClasses(): GeneratedClass[] {
  return generateScentWorkClasses(getScentWorkSport('AKC')).map(cls => ({
    className: cls.className,
    element: cls.element,
    ...(cls.level ? { level: cls.level } : {}),
    ...(cls.section ? { section: cls.section } : {}),
    maxEntries: cls.element === 'Detective' ? 30 : 40,
    customFields: getGeneratedCustomFields(cls.element, cls.level),
  }));
}

// Validation function for AKC Scent Work classes
export function validateAKCScentWorkClass(
  element: string,
  level?: string,
  division?: string
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Detective validation
  if (element === 'Detective') {
    if (level || division) {
      errors.push('Detective class cannot have levels or divisions');
    }
    return { valid: errors.length === 0, errors };
  }

  // Handler Discrimination validation
  if (element === 'Handler Discrimination') {
    if (!level) {
      errors.push('Handler Discrimination requires a level');
    }
    if (level === 'Novice' && !division) {
      errors.push('Handler Discrimination Novice requires division A or B');
    }
    if (level !== 'Novice' && division) {
      errors.push('Only Novice level has divisions A and B');
    }
  }

  // Standard element validation
  const standardElements = ['Interior', 'Exterior', 'Container', 'Buried'];
  if (standardElements.includes(element)) {
    if (!level) {
      errors.push(`${element} classes require a level (Novice, Advanced, Excellent, Master)`);
    }
    if (level === 'Novice' && !division) {
      errors.push('Novice level requires division A or B');
    }
    if (level !== 'Novice' && division) {
      errors.push('Only Novice level has divisions A and B');
    }
  }

  return { valid: errors.length === 0, errors };
}

// Get class requirements based on official AKC rules
export function getAKCScentWorkClassRequirements(
  element: string,
  level?: string
): {
  hideCount: string;
  searchType: 'Known' | 'Unknown';
  difficulty: string;
  specialRules: string[];
} {
  const requirements = {
    hideCount: '1',
    searchType: 'Known' as const,
    difficulty: 'Basic',
    specialRules: [] as string[],
  };

  if (element === 'Detective') {
    return {
      hideCount: 'Unknown',
      searchType: 'Unknown',
      difficulty: 'Ultimate Challenge',
      specialRules: [
        'Large search area incorporating interiors AND exteriors',
        'Complex odor problems allowed (converging, elevation, eddying, pooling, channeling)',
        'No demo dog used - time limit set prior to first competitor',
        'Showcases ultimate teamwork between handler and dog',
      ],
    };
  }

  switch (level) {
    case 'Novice':
      return {
        hideCount: '1',
        searchType: 'Known',
        difficulty: 'Basic',
        specialRules: [
          'Basic odor obedience and understanding of driving to source',
          'Straightforward placement - no tricks',
          'No significant air movement, complex placement, or pooling',
          'Accessible location only',
        ],
      };

    case 'Advanced':
      return {
        hideCount: '2',
        searchType: 'Known',
        difficulty: 'Intermediate',
        specialRules: [
          'Two relatively simple hides',
          'Tests simple multiple hide detection',
          'Converging odor should be minimized',
          'Fairly simple airflow puzzles',
        ],
      };

    case 'Excellent':
      return {
        hideCount: element === 'Interior' ? 'Unknown (1-3)' : 'Variable',
        searchType: element === 'Interior' ? 'Unknown' : 'Known',
        difficulty: 'Complex',
        specialRules: [
          'At least one difficult hide',
          'Unknown number of hides (for Interior)',
          'Inaccessible hides introduced',
          'Basic converging odor and elevation allowed',
          'No blank search areas (Interior)',
        ],
      };

    case 'Master':
      return {
        hideCount: 'Unknown',
        searchType: 'Unknown',
        difficulty: 'Expert',
        specialRules: [
          'Tests ultimate teamwork',
          'Handler must read dog and determine when areas are clear',
          'Time management and efficiency challenged',
          'Converging, pooling, eddying, channeling odor allowed',
          'Inaccessible hides allowed',
          'Maximum one blank area (Interior)',
        ],
      };

    default:
      return requirements;
  }
}
