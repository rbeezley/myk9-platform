/**
 * Score Validator Service
 *
 * Comprehensive validation logic for all competition scoring formats.
 * Provides format-specific validation rules, real-time validation,
 * and detailed error reporting with suggestions for corrections.
 *
 * Key Features:
 * - Multi-format validation (Scent Work, Agility, Obedience, etc.)
 * - Real-time validation during score entry
 * - Business rule validation (time limits, scoring ranges, etc.)
 * - Cross-field validation and dependencies
 * - Detailed error messages with correction suggestions
 * - Custom validation rule engine
 * - Performance optimized for real-time use
 */

import type {
  BaseScore,
  ScoringFormat,
  ValidationResult,
  ValidationRule,
  ScoringValidation
} from '@/types/scoring-types';
import { isAgilityScore, isObedienceScore, isRallyScore } from '@/types/scoring-types';
import type { ScentWorkResult } from '@/types/scent-work-types';
import { logger } from '@/services/LoggingService';

// Import extracted modules
import { applyFormatSpecificValidation } from './formatValidators';
import { initializeAllValidationRules, getMaxReasonableTime } from './validationRules';

// ============================================================================
// Configuration
// ============================================================================

export interface ValidatorConfig {
  enableRealTimeValidation: boolean;
  enableWarnings: boolean;
  enableBusinessRuleValidation: boolean;
  customRules: Map<ScoringFormat, ValidationRule[]>;
}

const DEFAULT_CONFIG: ValidatorConfig = {
  enableRealTimeValidation: true,
  enableWarnings: true,
  enableBusinessRuleValidation: true,
  customRules: new Map()
};

// ============================================================================
// Score Validator Service
// ============================================================================

export class ScoreValidatorService {
  private config: ValidatorConfig;
  private validationRules: Map<ScoringFormat, ScoringValidation>;

  constructor(config: Partial<ValidatorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.validationRules = initializeAllValidationRules();
  }

  // ========================================================================
  // Main Validation Methods
  // ========================================================================

  async validateScore(score: BaseScore): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    try {
      const validation = this.validationRules.get(score.format);
      if (!validation) {
        result.errors.push({
          field: 'format',
          message: `Unsupported scoring format: ${score.format}`,
          code: 'UNSUPPORTED_FORMAT'
        });
        result.isValid = false;
        return result;
      }

      this.applyValidationRules(score, validation.rules, result);
      await applyFormatSpecificValidation(score, result);

      if (this.config.enableBusinessRuleValidation) {
        await this.applyBusinessRuleValidation(score, result);
      }

      await this.applyCrossFieldValidation(score, result);
      result.isValid = result.errors.length === 0;

      return result;
    } catch (error) {
      logger.error('Validation error:', 'scoring', {}, error as Error);
      result.errors.push({
        field: 'general',
        message: 'Internal validation error occurred',
        code: 'VALIDATION_ERROR'
      });
      result.isValid = false;
      return result;
    }
  }

  async validateRealTime(score: Partial<BaseScore>): Promise<ValidationResult> {
    if (!this.config.enableRealTimeValidation) {
      return { isValid: true, errors: [], warnings: [] };
    }

    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    if (score.format) {
      const validation = this.validationRules.get(score.format);
      if (validation) {
        const criticalRules = validation.rules.filter(
          rule => rule.rule === 'required' || rule.rule === 'range'
        );
        this.applyValidationRules(score, criticalRules, result);
      }
    }

    result.isValid = result.errors.length === 0;
    return result;
  }

  async validateScores(scores: BaseScore[]): Promise<Map<string, ValidationResult>> {
    const results = new Map<string, ValidationResult>();

    for (const score of scores) {
      const scoreKey = `${score.entryId}-${score.classId}-${score.judgeId}`;
      const validation = await this.validateScore(score);
      results.set(scoreKey, validation);
    }

    return results;
  }

  // ========================================================================
  // Validation Rule Application
  // ========================================================================

  private applyValidationRules(
    score: BaseScore | Partial<BaseScore>,
    rules: ValidationRule[],
    result: ValidationResult
  ): void {
    for (const rule of rules) {
      const value = this.getFieldValue(score as Record<string, unknown>, rule.field);

      switch (rule.rule) {
        case 'required':
          if (value === undefined || value === null || value === '') {
            result.errors.push({
              field: rule.field,
              message: rule.errorMessage,
              code: 'REQUIRED_FIELD'
            });
          }
          break;

        case 'range':
          if (rule.parameters && typeof value === 'number') {
            const min = rule.parameters.min as number | undefined;
            const max = rule.parameters.max as number | undefined;
            if ((min !== undefined && value < min) || (max !== undefined && value > max)) {
              result.errors.push({
                field: rule.field,
                message: rule.errorMessage,
                code: 'OUT_OF_RANGE'
              });
            }
          }
          break;

        case 'format':
          if (rule.parameters && typeof value === 'string') {
            const pattern = rule.parameters.pattern as string | undefined;
            if (pattern && !new RegExp(pattern).test(value)) {
              result.errors.push({
                field: rule.field,
                message: rule.errorMessage,
                code: 'INVALID_FORMAT'
              });
            }
          }
          break;

        case 'dependency':
          this.validateDependency(score as BaseScore, rule, result);
          break;
      }
    }
  }

  private validateDependency(
    score: BaseScore,
    rule: ValidationRule,
    result: ValidationResult
  ): void {
    if (!rule.parameters) return;

    const dependsOn = rule.parameters.dependsOn as string;
    const condition = rule.parameters.condition as string;
    const expectedValue = rule.parameters.expectedValue;
    const dependentValue = this.getFieldValue(
      score as unknown as Record<string, unknown>,
      dependsOn
    );
    const currentValue = this.getFieldValue(
      score as unknown as Record<string, unknown>,
      rule.field
    );

    let shouldBePresent = false;

    switch (condition) {
      case 'equals':
        shouldBePresent = dependentValue === expectedValue;
        break;
      case 'not_equals':
        shouldBePresent = dependentValue !== expectedValue;
        break;
      case 'exists':
        shouldBePresent = dependentValue !== undefined && dependentValue !== null;
        break;
      case 'not_exists':
        shouldBePresent = dependentValue === undefined || dependentValue === null;
        break;
    }

    if (
      shouldBePresent &&
      (currentValue === undefined || currentValue === null || currentValue === '')
    ) {
      result.errors.push({
        field: rule.field,
        message: rule.errorMessage,
        code: 'DEPENDENCY_VIOLATION'
      });
    }
  }

  // ========================================================================
  // Business Rule Validation
  // ========================================================================

  private async applyBusinessRuleValidation(
    score: BaseScore,
    result: ValidationResult
  ): Promise<void> {
    await this.validateTimeReasonableness(score, result);
    await this.validateQualificationConsistency(score, result);
    await this.validateEntryTiming(score, result);
  }

  private async validateTimeReasonableness(
    score: BaseScore,
    result: ValidationResult
  ): Promise<void> {
    let timeValue: number | undefined;

    if (isAgilityScore(score)) {
      timeValue = score.courseTime;
    } else if (isRallyScore(score)) {
      timeValue = score.courseTime;
    } else if (score.format === 'scent_work') {
      timeValue =
        (score as BaseScore & { searchTime?: number; totalSearchTime?: number }).searchTime ||
        (score as BaseScore & { searchTime?: number; totalSearchTime?: number }).totalSearchTime;
    }

    if (timeValue !== undefined) {
      if (timeValue < 1000 && score.qualification === 'Qualified') {
        result.warnings.push({
          field: 'time',
          message: 'Very fast time - please verify accuracy',
          suggestion: 'Double-check timer was started/stopped correctly'
        });
      }

      const maxReasonableTime = getMaxReasonableTime(score.format);
      if (timeValue > maxReasonableTime) {
        result.warnings.push({
          field: 'time',
          message: 'Unusually long time - please verify accuracy',
          suggestion: 'Check if timer was stopped correctly'
        });
      }
    }
  }

  private async validateQualificationConsistency(
    score: BaseScore,
    result: ValidationResult
  ): Promise<void> {
    if (['Absent', 'Withdrawn'].includes(score.qualification)) {
      const hasScoreData = this.hasScoreData(score);
      if (hasScoreData) {
        result.warnings.push({
          field: 'qualification',
          message: 'Absent/Withdrawn entry has scoring data',
          suggestion: 'Consider if qualification status is correct'
        });
      }
    }

    if (score.qualification === 'Qualified') {
      const missingData = this.getMissingRequiredData(score);
      if (missingData.length > 0) {
        result.warnings.push({
          field: 'qualification',
          message: `Qualified entry missing: ${missingData.join(', ')}`,
          suggestion: 'Ensure all required scoring data is entered'
        });
      }
    }
  }

  private async validateEntryTiming(score: BaseScore, result: ValidationResult): Promise<void> {
    const now = new Date();
    const recordedAt = score.recordedAt;

    if (recordedAt > now) {
      result.errors.push({
        field: 'recordedAt',
        message: 'Score cannot be recorded in the future',
        code: 'FUTURE_TIMESTAMP'
      });
    }

    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    if (recordedAt < oneYearAgo) {
      result.warnings.push({
        field: 'recordedAt',
        message: 'Score timestamp is over a year old',
        suggestion: 'Verify the recorded date is correct'
      });
    }
  }

  // ========================================================================
  // Cross-Field Validation
  // ========================================================================

  private async applyCrossFieldValidation(
    score: BaseScore,
    result: ValidationResult
  ): Promise<void> {
    this.validateQualificationFieldConsistency(score, result);
    this.validateJudgeEntryRelationship(score, result);
  }

  private validateQualificationFieldConsistency(score: BaseScore, result: ValidationResult): void {
    if (
      score.qualification === 'Not Qualified' &&
      !(score as BaseScore & { qualificationReason?: string }).qualificationReason &&
      !score.judgeNotes
    ) {
      result.warnings.push({
        field: 'qualificationReason',
        message: 'Non-qualifying entry should have a reason',
        suggestion: 'Add qualification reason or judge notes'
      });
    }

    if (['Excused', 'Withdrawn'].includes(score.qualification) && !score.judgeNotes) {
      result.warnings.push({
        field: 'judgeNotes',
        message: 'Excused/Withdrawn entry should have explanation',
        suggestion: 'Add judge notes explaining the situation'
      });
    }
  }

  private validateJudgeEntryRelationship(score: BaseScore, result: ValidationResult): void {
    if (!score.judgeId || score.judgeId.trim() === '') {
      result.errors.push({
        field: 'judgeId',
        message: 'Valid judge ID is required',
        code: 'INVALID_JUDGE'
      });
    }
  }

  // ========================================================================
  // Helper Methods
  // ========================================================================

  private getFieldValue(obj: Record<string, unknown>, field: string): unknown {
    return field.split('.').reduce((current: unknown, key: string) => {
      if (current && typeof current === 'object' && key in current) {
        return (current as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
  }

  private hasScoreData(score: BaseScore): boolean {
    if (isAgilityScore(score)) {
      return score.courseTime > 0 || score.totalFaults > 0;
    }
    if (isObedienceScore(score)) {
      return (score.totalScore ?? 0) > 0;
    }
    if (isRallyScore(score)) {
      return score.finalScore > 0 || score.courseTime > 0;
    }
    if (score.format === 'scent_work') {
      const scentScore = score as BaseScore & ScentWorkResult;
      return scentScore.searchTime > 0;
    }
    return false;
  }

  private getMissingRequiredData(score: BaseScore): string[] {
    const missing: string[] = [];

    if (isAgilityScore(score)) {
      if (!score.courseTime) missing.push('course time');
    }
    if (isObedienceScore(score)) {
      if ((score.totalScore ?? 0) === 0) missing.push('total score');
      if (!score.exercises || score.exercises.length === 0) missing.push('exercise scores');
    }
    if (isRallyScore(score)) {
      if (!score.finalScore) missing.push('final score');
    }
    if (score.format === 'scent_work') {
      const scentScore = score as BaseScore & ScentWorkResult;
      if (!scentScore.searchTime) missing.push('search time');
    }

    return missing;
  }

  // ========================================================================
  // Public API Methods
  // ========================================================================

  addCustomRules(format: ScoringFormat, rules: ValidationRule[]): void {
    const existing = this.config.customRules.get(format) || [];
    this.config.customRules.set(format, [...existing, ...rules]);

    const validation = this.validationRules.get(format);
    if (validation) {
      validation.rules.push(...rules);
    }
  }

  getValidationRules(format: ScoringFormat): ValidationRule[] {
    const validation = this.validationRules.get(format);
    return validation ? [...validation.rules] : [];
  }

  isRealTimeValidationEnabled(): boolean {
    return this.config.enableRealTimeValidation;
  }

  updateConfig(config: Partial<ValidatorConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// Singleton instance
export const scoreValidatorService = new ScoreValidatorService();
