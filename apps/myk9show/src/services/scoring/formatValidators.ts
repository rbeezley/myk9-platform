/**
 * Format-Specific Validators
 *
 * Validation logic for different scoring formats (Scent Work, Agility,
 * Obedience, Rally, Conformation, etc.).
 */

import type {
  BaseScore,
  ValidationResult,
  AgilityScore,
  ObedienceScore,
  RallyScore,
  ConformationScore
} from '@/types/scoring-types';
import {
  isAgilityScore,
  isObedienceScore,
  isRallyScore,
  isConformationScore
} from '@/types/scoring-types';
import type { ScentWorkResult, MultiAreaScentWorkResult } from '@/types/scent-work-types';

// ============================================================================
// Scent Work Validation
// ============================================================================

export async function validateScentWorkScore(
  score: ScentWorkResult | MultiAreaScentWorkResult,
  result: ValidationResult
): Promise<void> {
  const searchTime = 'totalSearchTime' in score ? score.totalSearchTime : score.searchTime;
  if (searchTime < 0) {
    result.errors.push({
      field: 'searchTime',
      message: 'Search time cannot be negative',
      code: 'INVALID_TIME'
    });
  }

  const faults = 'totalFaults' in score ? score.totalFaults : score.faults;
  if (faults < 0) {
    result.errors.push({
      field: 'faults',
      message: 'Faults cannot be negative',
      code: 'INVALID_FAULTS'
    });
  }

  const maxTimeAllowed =
    'maxTimeAllowed' in score ? (score as { maxTimeAllowed?: number }).maxTimeAllowed : undefined;
  if (score.qualification === 'Qualified' && maxTimeAllowed && searchTime > maxTimeAllowed) {
    result.warnings.push({
      field: 'qualification',
      message: 'Dog qualified but exceeded time limit',
      suggestion: 'Verify qualification status'
    });
  }

  if ('areaResults' in score) {
    validateMultiAreaScore(score, result);
  }
}

function validateMultiAreaScore(score: MultiAreaScentWorkResult, result: ValidationResult): void {
  if (!score.areaResults || score.areaResults.length === 0) {
    result.errors.push({
      field: 'areaResults',
      message: 'Multi-area score must have area results',
      code: 'MISSING_AREA_RESULTS'
    });
    return;
  }

  const calculatedTotal = score.areaResults.reduce((sum, area) => sum + area.searchTime, 0);
  if (Math.abs(calculatedTotal - score.totalSearchTime) > 100) {
    result.errors.push({
      field: 'totalSearchTime',
      message: 'Total search time does not match sum of area times',
      code: 'TIME_CALCULATION_ERROR'
    });
  }

  const calculatedFaults = score.areaResults.reduce((sum, area) => sum + area.faults, 0);
  if (calculatedFaults !== score.totalFaults) {
    result.errors.push({
      field: 'totalFaults',
      message: 'Total faults do not match sum of area faults',
      code: 'FAULT_CALCULATION_ERROR'
    });
  }
}

// ============================================================================
// Agility Validation
// ============================================================================

export async function validateAgilityScore(
  score: AgilityScore,
  result: ValidationResult
): Promise<void> {
  if (score.courseTime < 0) {
    result.errors.push({
      field: 'courseTime',
      message: 'Course time cannot be negative',
      code: 'INVALID_TIME'
    });
  }

  const calculatedFaults = score.jumpFaults * 5 + score.refusals * 20 + score.otherFaults;
  if (calculatedFaults !== score.totalFaults) {
    result.errors.push({
      field: 'totalFaults',
      message: 'Total faults calculation is incorrect',
      code: 'FAULT_CALCULATION_ERROR'
    });
  }

  if (score.excusedEliminated && score.qualification === 'Qualified') {
    result.errors.push({
      field: 'qualification',
      message: 'Dog cannot be qualified if excused/eliminated',
      code: 'QUALIFICATION_CONFLICT'
    });
  }

  if (score.refusals >= 3 && score.qualification === 'Qualified') {
    result.warnings.push({
      field: 'refusals',
      message: 'Dog has 3+ refusals but is marked as qualified',
      suggestion: 'Verify qualification status'
    });
  }
}

// ============================================================================
// Obedience Validation
// ============================================================================

export async function validateObedienceScore(
  score: ObedienceScore,
  result: ValidationResult
): Promise<void> {
  if (score.exercises && score.exercises.length > 0) {
    const calculatedTotal = score.exercises.reduce(
      (sum, exercise) => sum + exercise.pointsAwarded,
      0
    );
    if (calculatedTotal !== (score.totalScore ?? 0)) {
      result.errors.push({
        field: 'totalScore',
        message: 'Total score does not match sum of exercise scores',
        code: 'SCORE_CALCULATION_ERROR'
      });
    }

    score.exercises.forEach((exercise, index) => {
      if (exercise.pointsAwarded > exercise.maxPoints) {
        result.errors.push({
          field: `exercises[${index}].pointsAwarded`,
          message: `Exercise "${exercise.name}" points exceed maximum`,
          code: 'POINTS_EXCEED_MAXIMUM'
        });
      }

      if (exercise.pointsAwarded < 0) {
        result.errors.push({
          field: `exercises[${index}].pointsAwarded`,
          message: `Exercise "${exercise.name}" points cannot be negative`,
          code: 'NEGATIVE_POINTS'
        });
      }
    });
  }

  if (score.isQualifying && (score.totalScore ?? 0) < (score.qualifyingScore ?? 0)) {
    result.errors.push({
      field: 'isQualifying',
      message: 'Score is below qualifying threshold but marked as qualifying',
      code: 'QUALIFICATION_THRESHOLD_ERROR'
    });
  }
}

// ============================================================================
// Rally Validation
// ============================================================================

export async function validateRallyScore(
  score: RallyScore,
  result: ValidationResult
): Promise<void> {
  const calculatedDeductions =
    score.stationDeductions + score.lackOfControl + score.repeatStation;
  if (calculatedDeductions !== score.totalDeductions) {
    result.errors.push({
      field: 'totalDeductions',
      message: 'Total deductions calculation is incorrect',
      code: 'DEDUCTION_CALCULATION_ERROR'
    });
  }

  const expectedFinalScore = 210 - score.totalDeductions;
  if (score.finalScore !== expectedFinalScore) {
    result.errors.push({
      field: 'finalScore',
      message: 'Final score calculation is incorrect',
      code: 'FINAL_SCORE_ERROR'
    });
  }

  if (score.isQualifying && score.finalScore < score.qualifyingScore) {
    result.errors.push({
      field: 'isQualifying',
      message: 'Final score is below qualifying threshold',
      code: 'QUALIFICATION_THRESHOLD_ERROR'
    });
  }

  if (score.maxCourseTime && score.courseTime > score.maxCourseTime) {
    if (!score.timeFault) {
      result.warnings.push({
        field: 'timeFault',
        message: 'Course time exceeded but time fault not marked',
        suggestion: 'Check if time fault should be applied'
      });
    }
  }
}

// ============================================================================
// Conformation Validation
// ============================================================================

export async function validateConformationScore(
  score: ConformationScore,
  result: ValidationResult
): Promise<void> {
  if (score.placement && score.placement < 1) {
    result.errors.push({
      field: 'placement',
      message: 'Placement cannot be less than 1',
      code: 'INVALID_PLACEMENT'
    });
  }

  if (score.pointsAwarded < 0) {
    result.errors.push({
      field: 'pointsAwarded',
      message: 'Points awarded cannot be negative',
      code: 'NEGATIVE_POINTS'
    });
  }

  if (score.majorWin && score.pointsAwarded < 3) {
    result.errors.push({
      field: 'majorWin',
      message: 'Major win requires 3+ points',
      code: 'MAJOR_WIN_ERROR'
    });
  }

  const assessmentFields = ['gaitScore', 'typeScore', 'temperamentScore'];
  assessmentFields.forEach(field => {
    const value = (score as unknown as Record<string, unknown>)[field];
    if (value !== undefined && typeof value === 'number' && (value < 1 || value > 10)) {
      result.errors.push({
        field,
        message: `${field} must be between 1 and 10`,
        code: 'ASSESSMENT_RANGE_ERROR'
      });
    }
  });
}

// ============================================================================
// Format-Specific Validation Router
// ============================================================================

export async function applyFormatSpecificValidation(
  score: BaseScore,
  result: ValidationResult
): Promise<void> {
  switch (score.format) {
    case 'scent_work':
      await validateScentWorkScore(score as BaseScore & ScentWorkResult, result);
      break;
    case 'agility':
      if (isAgilityScore(score)) {
        await validateAgilityScore(score, result);
      }
      break;
    case 'obedience':
      if (isObedienceScore(score)) {
        await validateObedienceScore(score, result);
      }
      break;
    case 'rally':
      if (isRallyScore(score)) {
        await validateRallyScore(score, result);
      }
      break;
    case 'conformation':
      if (isConformationScore(score)) {
        await validateConformationScore(score, result);
      }
      break;
  }
}
