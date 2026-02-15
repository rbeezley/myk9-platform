import { useCallback } from 'react';
import type { BaseScore, ValidationResult, ScoringFormat } from '@/types/scoring-types';
import { DEFAULT_SCORING_CONFIGS } from '@/types/scoring-types';

/**
 * Format-aware score validation hook.
 *
 * Checks required base fields and applies format-specific qualifying
 * thresholds from `DEFAULT_SCORING_CONFIGS`.
 */
export function useScoringValidation() {
  const validate = useCallback((score: BaseScore): ValidationResult => {
    const errors: ValidationResult['errors'] = [];
    const warnings: ValidationResult['warnings'] = [];

    // --- Required base fields ---
    if (!score.entryId) {
      errors.push({ field: 'entryId', message: 'Entry ID is required', code: 'REQUIRED' });
    }
    if (!score.classId) {
      errors.push({ field: 'classId', message: 'Class ID is required', code: 'REQUIRED' });
    }
    if (!score.judgeId) {
      errors.push({ field: 'judgeId', message: 'Judge ID is required', code: 'REQUIRED' });
    }
    if (!score.format) {
      errors.push({ field: 'format', message: 'Scoring format is required', code: 'REQUIRED' });
    }

    // --- Format-specific rules ---
    const config = DEFAULT_SCORING_CONFIGS[score.format as ScoringFormat];
    if (config) {
      // Time validation
      if (score.time !== undefined && config.maxTimeLimit !== undefined) {
        if (score.time > config.maxTimeLimit) {
          errors.push({
            field: 'time',
            message: `Time exceeds limit of ${config.maxTimeLimit}ms`,
            code: 'TIME_EXCEEDED',
          });
        }
      }

      // Qualifying threshold warning
      if (config.qualifyingThreshold !== undefined && score.points !== undefined) {
        if (score.points < config.qualifyingThreshold) {
          warnings.push({
            field: 'points',
            message: `Score ${score.points} is below qualifying threshold of ${config.qualifyingThreshold}`,
            suggestion: 'Verify the score is correct before submitting',
          });
        }
      }

      // Faults should be non-negative
      if (score.faults !== undefined && score.faults < 0) {
        errors.push({
          field: 'faults',
          message: 'Faults cannot be negative',
          code: 'INVALID_VALUE',
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }, []);

  return { validate };
}
