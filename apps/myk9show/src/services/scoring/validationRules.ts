/**
 * Validation Rules
 *
 * Defines validation rules for different scoring formats including
 * base rules common to all formats and format-specific rules.
 */

import type { ScoringFormat, ValidationRule, ScoringValidation } from '@/types/scoring-types';
import { DEFAULT_SCORING_CONFIGS } from '@/types/scoring-types';

// ============================================================================
// Base Validation Rules (common to all formats)
// ============================================================================

export function getBaseValidationRules(): ValidationRule[] {
  return [
    {
      field: 'entryId',
      rule: 'required',
      errorMessage: 'Entry ID is required'
    },
    {
      field: 'classId',
      rule: 'required',
      errorMessage: 'Class ID is required'
    },
    {
      field: 'judgeId',
      rule: 'required',
      errorMessage: 'Judge ID is required'
    },
    {
      field: 'qualification',
      rule: 'required',
      errorMessage: 'Qualification status is required'
    },
    {
      field: 'recordedBy',
      rule: 'required',
      errorMessage: 'Recorded by field is required'
    }
  ];
}

// ============================================================================
// Format-Specific Validation Rules
// ============================================================================

export function getScentWorkRules(): ValidationRule[] {
  return [
    {
      field: 'searchTime',
      rule: 'range',
      parameters: { min: 0, max: 600000 }, // 0 to 10 minutes
      errorMessage: 'Search time must be between 0 and 10 minutes'
    },
    {
      field: 'faults',
      rule: 'range',
      parameters: { min: 0, max: 99 },
      errorMessage: 'Faults must be between 0 and 99'
    }
  ];
}

export function getAgilityRules(): ValidationRule[] {
  return [
    {
      field: 'courseTime',
      rule: 'range',
      parameters: { min: 0, max: 300000 }, // 0 to 5 minutes
      errorMessage: 'Course time must be between 0 and 5 minutes'
    },
    {
      field: 'jumpFaults',
      rule: 'range',
      parameters: { min: 0, max: 50 },
      errorMessage: 'Jump faults must be between 0 and 50'
    },
    {
      field: 'refusals',
      rule: 'range',
      parameters: { min: 0, max: 10 },
      errorMessage: 'Refusals must be between 0 and 10'
    }
  ];
}

export function getObedienceRules(): ValidationRule[] {
  return [
    {
      field: 'totalScore',
      rule: 'range',
      parameters: { min: 0, max: 200 },
      errorMessage: 'Total score must be between 0 and 200'
    },
    {
      field: 'qualifyingScore',
      rule: 'range',
      parameters: { min: 0, max: 200 },
      errorMessage: 'Qualifying score must be between 0 and 200'
    }
  ];
}

export function getRallyRules(): ValidationRule[] {
  return [
    {
      field: 'finalScore',
      rule: 'range',
      parameters: { min: 0, max: 210 },
      errorMessage: 'Final score must be between 0 and 210'
    },
    {
      field: 'totalDeductions',
      rule: 'range',
      parameters: { min: 0, max: 210 },
      errorMessage: 'Total deductions cannot exceed 210'
    }
  ];
}

export function getConformationRules(): ValidationRule[] {
  return [
    {
      field: 'pointsAwarded',
      rule: 'range',
      parameters: { min: 0, max: 10 },
      errorMessage: 'Points awarded must be between 0 and 10'
    }
  ];
}

export function getTrackingRules(): ValidationRule[] {
  return [
    {
      field: 'articlesFound',
      rule: 'range',
      parameters: { min: 0, max: 10 },
      errorMessage: 'Articles found must be between 0 and 10'
    }
  ];
}

export function getLureCoursingRules(): ValidationRule[] {
  return [
    {
      field: 'totalScore',
      rule: 'range',
      parameters: { min: 0, max: 125 }, // 5 categories × 25 points each
      errorMessage: 'Total score must be between 0 and 125'
    }
  ];
}

export function getBarnHuntRules(): ValidationRule[] {
  return [
    {
      field: 'ratsFound',
      rule: 'range',
      parameters: { min: 0, max: 10 },
      errorMessage: 'Rats found must be between 0 and 10'
    }
  ];
}

export function getFastCatRules(): ValidationRule[] {
  return [
    {
      field: 'speed',
      rule: 'range',
      parameters: { min: 0, max: 50 }, // mph
      errorMessage: 'Speed must be between 0 and 50 mph'
    }
  ];
}

export function getDockDivingRules(): ValidationRule[] {
  return [
    {
      field: 'distance',
      rule: 'range',
      parameters: { min: 0, max: 50 }, // feet
      errorMessage: 'Distance must be between 0 and 50 feet'
    }
  ];
}

// ============================================================================
// Format Rules Router
// ============================================================================

export function getFormatSpecificRules(format: ScoringFormat): ValidationRule[] {
  switch (format) {
    case 'scent_work':
      return getScentWorkRules();
    case 'agility':
      return getAgilityRules();
    case 'obedience':
      return getObedienceRules();
    case 'rally':
      return getRallyRules();
    case 'conformation':
      return getConformationRules();
    case 'tracking':
      return getTrackingRules();
    case 'lure_coursing':
      return getLureCoursingRules();
    case 'barn_hunt':
      return getBarnHuntRules();
    case 'fast_cat':
      return getFastCatRules();
    case 'dock_diving':
      return getDockDivingRules();
    default:
      return [];
  }
}

// ============================================================================
// Validation Rules Factory
// ============================================================================

export function createValidationRulesForFormat(format: ScoringFormat): ScoringValidation {
  const baseRules = getBaseValidationRules();
  const formatSpecificRules = getFormatSpecificRules(format);

  return {
    format,
    rules: [...baseRules, ...formatSpecificRules]
  };
}

export function initializeAllValidationRules(): Map<ScoringFormat, ScoringValidation> {
  const rules = new Map<ScoringFormat, ScoringValidation>();

  Object.keys(DEFAULT_SCORING_CONFIGS).forEach(format => {
    rules.set(format as ScoringFormat, createValidationRulesForFormat(format as ScoringFormat));
  });

  return rules;
}

// ============================================================================
// Max Reasonable Time by Format
// ============================================================================

export function getMaxReasonableTime(format: ScoringFormat): number {
  switch (format) {
    case 'scent_work':
      return 600000; // 10 minutes
    case 'agility':
      return 300000; // 5 minutes
    case 'rally':
      return 600000; // 10 minutes
    case 'obedience':
      return 1800000; // 30 minutes (for full routine)
    default:
      return 600000; // 10 minutes default
  }
}
