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
  ScoringValidation,
  AgilityScore,
  ObedienceScore,
  RallyScore,
  ConformationScore
} from '@/types/scoring-types';
import {
  DEFAULT_SCORING_CONFIGS,
  isAgilityScore,
  isObedienceScore,
  isRallyScore,
  isConformationScore
} from '@/types/scoring-types';
import type { ScentWorkResult, MultiAreaScentWorkResult } from '@/types/scent-work-types';
import { logger } from '@/services/LoggingService';

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

/**
 * Comprehensive score validation service
 */
export class ScoreValidatorService {
  private config: ValidatorConfig;
  private validationRules: Map<ScoringFormat, ScoringValidation>;

  constructor(config: Partial<ValidatorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.validationRules = new Map();
    this.initializeValidationRules();
  }

  // ========================================================================
  // Initialization
  // ========================================================================

  private initializeValidationRules(): void {
    // Initialize validation rules for each format
    Object.keys(DEFAULT_SCORING_CONFIGS).forEach(format => {
      this.validationRules.set(
        format as ScoringFormat,
        this.createValidationRulesForFormat(format as ScoringFormat)
      );
    });
  }

  private createValidationRulesForFormat(format: ScoringFormat): ScoringValidation {
    const baseRules: ValidationRule[] = [
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

    // Add format-specific rules
    const formatSpecificRules = this.getFormatSpecificRules(format);
    
    return {
      format,
      rules: [...baseRules, ...formatSpecificRules]
    };
  }

  private getFormatSpecificRules(format: ScoringFormat): ValidationRule[] {
    switch (format) {
      case 'scent_work':
        return this.getScentWorkRules();
      case 'agility':
        return this.getAgilityRules();
      case 'obedience':
        return this.getObedienceRules();
      case 'rally':
        return this.getRallyRules();
      case 'conformation':
        return this.getConformationRules();
      case 'tracking':
        return this.getTrackingRules();
      case 'lure_coursing':
        return this.getLureCoursingRules();
      case 'barn_hunt':
        return this.getBarnHuntRules();
      case 'fast_cat':
        return this.getFastCatRules();
      case 'dock_diving':
        return this.getDockDivingRules();
      default:
        return [];
    }
  }

  // ========================================================================
  // Main Validation Methods
  // ========================================================================

  /**
   * Validate a score according to its format rules
   */
  async validateScore(score: BaseScore): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    try {
      // Get validation rules for this format
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

      // Apply base validation rules
      this.applyValidationRules(score, validation.rules, result);

      // Apply format-specific validation
      await this.applyFormatSpecificValidation(score, result);

      // Apply business rule validation
      if (this.config.enableBusinessRuleValidation) {
        await this.applyBusinessRuleValidation(score, result);
      }

      // Apply cross-field validation
      await this.applyCrossFieldValidation(score, result);

      // Check if validation passed
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

  /**
   * Validate a score in real-time (optimized for performance)
   */
  async validateRealTime(score: Partial<BaseScore>): Promise<ValidationResult> {
    if (!this.config.enableRealTimeValidation) {
      return { isValid: true, errors: [], warnings: [] };
    }

    // For real-time validation, we're more lenient and focus on critical errors only
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    // Only validate required fields and basic format rules
    if (score.format) {
      const validation = this.validationRules.get(score.format);
      if (validation) {
        const criticalRules = validation.rules.filter(rule => 
          rule.rule === 'required' || rule.rule === 'range'
        );
        this.applyValidationRules(score, criticalRules, result);
      }
    }

    result.isValid = result.errors.length === 0;
    return result;
  }

  /**
   * Validate multiple scores (batch validation)
   */
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
          // Handle field dependencies
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
    const dependentValue = this.getFieldValue(score as unknown as Record<string, unknown>, dependsOn);
    const currentValue = this.getFieldValue(score as unknown as Record<string, unknown>, rule.field);

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

    if (shouldBePresent && (currentValue === undefined || currentValue === null || currentValue === '')) {
      result.errors.push({
        field: rule.field,
        message: rule.errorMessage,
        code: 'DEPENDENCY_VIOLATION'
      });
    }
  }

  // ========================================================================
  // Format-Specific Validation
  // ========================================================================

  private async applyFormatSpecificValidation(
    score: BaseScore,
    result: ValidationResult
  ): Promise<void> {
    switch (score.format) {
      case 'scent_work':
        await this.validateScentWorkScore(score as BaseScore & ScentWorkResult, result);
        break;
      case 'agility':
        if (isAgilityScore(score)) {
          await this.validateAgilityScore(score, result);
        }
        break;
      case 'obedience':
        if (isObedienceScore(score)) {
          await this.validateObedienceScore(score, result);
        }
        break;
      case 'rally':
        if (isRallyScore(score)) {
          await this.validateRallyScore(score, result);
        }
        break;
      case 'conformation':
        if (isConformationScore(score)) {
          await this.validateConformationScore(score, result);
        }
        break;
      // Add other formats as needed
    }
  }

  private async validateScentWorkScore(
    score: ScentWorkResult | MultiAreaScentWorkResult,
    result: ValidationResult
  ): Promise<void> {
    // Validate search time
    const searchTime = 'totalSearchTime' in score ? score.totalSearchTime : score.searchTime;
    if (searchTime < 0) {
      result.errors.push({
        field: 'searchTime',
        message: 'Search time cannot be negative',
        code: 'INVALID_TIME'
      });
    }

    // Validate faults
    const faults = 'totalFaults' in score ? score.totalFaults : score.faults;
    if (faults < 0) {
      result.errors.push({
        field: 'faults',
        message: 'Faults cannot be negative',
        code: 'INVALID_FAULTS'
      });
    }

    // Validate qualification logic
    const maxTimeAllowed = 'maxTimeAllowed' in score ? (score as { maxTimeAllowed?: number }).maxTimeAllowed : undefined;
    if (score.qualification === 'Qualified' && maxTimeAllowed && searchTime > maxTimeAllowed) {
      result.warnings.push({
        field: 'qualification',
        message: 'Dog qualified but exceeded time limit',
        suggestion: 'Verify qualification status'
      });
    }

    // Multi-area specific validation
    if ('areaResults' in score) {
      this.validateMultiAreaScore(score, result);
    }
  }

  private validateMultiAreaScore(
    score: MultiAreaScentWorkResult,
    result: ValidationResult
  ): void {
    if (!score.areaResults || score.areaResults.length === 0) {
      result.errors.push({
        field: 'areaResults',
        message: 'Multi-area score must have area results',
        code: 'MISSING_AREA_RESULTS'
      });
      return;
    }

    // Validate total time calculation
    const calculatedTotal = score.areaResults.reduce((sum, area) => sum + area.searchTime, 0);
    if (Math.abs(calculatedTotal - score.totalSearchTime) > 100) { // 100ms tolerance
      result.errors.push({
        field: 'totalSearchTime',
        message: 'Total search time does not match sum of area times',
        code: 'TIME_CALCULATION_ERROR'
      });
    }

    // Validate total faults calculation
    const calculatedFaults = score.areaResults.reduce((sum, area) => sum + area.faults, 0);
    if (calculatedFaults !== score.totalFaults) {
      result.errors.push({
        field: 'totalFaults',
        message: 'Total faults do not match sum of area faults',
        code: 'FAULT_CALCULATION_ERROR'
      });
    }
  }

  private async validateAgilityScore(
    score: AgilityScore,
    result: ValidationResult
  ): Promise<void> {
    // Validate time
    if (score.courseTime < 0) {
      result.errors.push({
        field: 'courseTime',
        message: 'Course time cannot be negative',
        code: 'INVALID_TIME'
      });
    }

    // Validate fault calculations
    const calculatedFaults = score.jumpFaults * 5 + score.refusals * 20 + score.otherFaults;
    if (calculatedFaults !== score.totalFaults) {
      result.errors.push({
        field: 'totalFaults',
        message: 'Total faults calculation is incorrect',
        code: 'FAULT_CALCULATION_ERROR'
      });
    }

    // Validate elimination logic
    if (score.excusedEliminated && score.qualification === 'Qualified') {
      result.errors.push({
        field: 'qualification',
        message: 'Dog cannot be qualified if excused/eliminated',
        code: 'QUALIFICATION_CONFLICT'
      });
    }

    // Check refusal limits (typically 3 refusals = elimination)
    if (score.refusals >= 3 && score.qualification === 'Qualified') {
      result.warnings.push({
        field: 'refusals',
        message: 'Dog has 3+ refusals but is marked as qualified',
        suggestion: 'Verify qualification status'
      });
    }
  }

  private async validateObedienceScore(
    score: ObedienceScore,
    result: ValidationResult
  ): Promise<void> {
    // Validate total score calculation
    if (score.exercises && score.exercises.length > 0) {
      const calculatedTotal = score.exercises.reduce((sum, exercise) => sum + exercise.pointsAwarded, 0);
      if (calculatedTotal !== (score.totalScore ?? 0)) {
        result.errors.push({
          field: 'totalScore',
          message: 'Total score does not match sum of exercise scores',
          code: 'SCORE_CALCULATION_ERROR'
        });
      }

      // Validate individual exercises
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

    // Validate qualifying score logic
    if (score.isQualifying && (score.totalScore ?? 0) < (score.qualifyingScore ?? 0)) {
      result.errors.push({
        field: 'isQualifying',
        message: 'Score is below qualifying threshold but marked as qualifying',
        code: 'QUALIFICATION_THRESHOLD_ERROR'
      });
    }
  }

  private async validateRallyScore(
    score: RallyScore,
    result: ValidationResult
  ): Promise<void> {
    // Validate deduction calculation
    const calculatedDeductions = score.stationDeductions + score.lackOfControl + score.repeatStation;
    if (calculatedDeductions !== score.totalDeductions) {
      result.errors.push({
        field: 'totalDeductions',
        message: 'Total deductions calculation is incorrect',
        code: 'DEDUCTION_CALCULATION_ERROR'
      });
    }

    // Validate final score calculation (usually 210 - deductions)
    const expectedFinalScore = 210 - score.totalDeductions;
    if (score.finalScore !== expectedFinalScore) {
      result.errors.push({
        field: 'finalScore',
        message: 'Final score calculation is incorrect',
        code: 'FINAL_SCORE_ERROR'
      });
    }

    // Validate qualifying logic
    if (score.isQualifying && score.finalScore < score.qualifyingScore) {
      result.errors.push({
        field: 'isQualifying',
        message: 'Final score is below qualifying threshold',
        code: 'QUALIFICATION_THRESHOLD_ERROR'
      });
    }

    // Validate time fault logic
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

  private async validateConformationScore(
    score: ConformationScore,
    result: ValidationResult
  ): Promise<void> {
    // Validate placement
    if (score.placement && score.placement < 1) {
      result.errors.push({
        field: 'placement',
        message: 'Placement cannot be less than 1',
        code: 'INVALID_PLACEMENT'
      });
    }

    // Validate points awarded
    if (score.pointsAwarded < 0) {
      result.errors.push({
        field: 'pointsAwarded',
        message: 'Points awarded cannot be negative',
        code: 'NEGATIVE_POINTS'
      });
    }

    // Validate major win logic
    if (score.majorWin && score.pointsAwarded < 3) {
      result.errors.push({
        field: 'majorWin',
        message: 'Major win requires 3+ points',
        code: 'MAJOR_WIN_ERROR'
      });
    }

    // Validate assessment scores if present
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

  // ========================================================================
  // Business Rule Validation
  // ========================================================================

  private async applyBusinessRuleValidation(
    score: BaseScore,
    result: ValidationResult
  ): Promise<void> {
    // Check for reasonable time values (not too fast or too slow)
    await this.validateTimeReasonableness(score, result);

    // Check for qualification consistency
    await this.validateQualificationConsistency(score, result);

    // Check for score entry timing
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
      timeValue = (score as BaseScore & { searchTime?: number; totalSearchTime?: number }).searchTime || (score as BaseScore & { searchTime?: number; totalSearchTime?: number }).totalSearchTime;
    }

    if (timeValue !== undefined) {
      // Very fast times (less than 1 second) might be errors
      if (timeValue < 1000 && score.qualification === 'Qualified') {
        result.warnings.push({
          field: 'time',
          message: 'Very fast time - please verify accuracy',
          suggestion: 'Double-check timer was started/stopped correctly'
        });
      }

      // Very slow times might indicate timer wasn't stopped
      const maxReasonableTime = this.getMaxReasonableTime(score.format);
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
    // Check if absent/withdrawn entries have scoring data
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

    // Check if qualified entries have required score data
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

  private async validateEntryTiming(
    score: BaseScore,
    result: ValidationResult
  ): Promise<void> {
    const now = new Date();
    const recordedAt = score.recordedAt;

    // Check if score was recorded in the future
    if (recordedAt > now) {
      result.errors.push({
        field: 'recordedAt',
        message: 'Score cannot be recorded in the future',
        code: 'FUTURE_TIMESTAMP'
      });
    }

    // Check if score is very old (might be data entry error)
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
    // Validate consistency between qualification and other fields
    this.validateQualificationFieldConsistency(score, result);

    // Validate judge and entry relationship
    this.validateJudgeEntryRelationship(score, result);
  }

  private validateQualificationFieldConsistency(
    score: BaseScore,
    result: ValidationResult
  ): void {
    // If not qualified, should have a reason
    if (score.qualification === 'Not Qualified' && !(score as BaseScore & { qualificationReason?: string }).qualificationReason && !score.judgeNotes) {
      result.warnings.push({
        field: 'qualificationReason',
        message: 'Non-qualifying entry should have a reason',
        suggestion: 'Add qualification reason or judge notes'
      });
    }

    // If excused/withdrawn, should have notes
    if (['Excused', 'Withdrawn'].includes(score.qualification) && !score.judgeNotes) {
      result.warnings.push({
        field: 'judgeNotes',
        message: 'Excused/Withdrawn entry should have explanation',
        suggestion: 'Add judge notes explaining the situation'
      });
    }
  }

  private validateJudgeEntryRelationship(
    score: BaseScore,
    result: ValidationResult
  ): void {
    // This would validate that the judge is authorized to score this entry
    // Implementation would depend on the specific business rules
    // For now, we'll just ensure the judgeId is not empty
    if (!score.judgeId || score.judgeId.trim() === '') {
      result.errors.push({
        field: 'judgeId',
        message: 'Valid judge ID is required',
        code: 'INVALID_JUDGE'
      });
    }
  }

  // ========================================================================
  // Format-Specific Validation Rules
  // ========================================================================

  private getScentWorkRules(): ValidationRule[] {
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

  private getAgilityRules(): ValidationRule[] {
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

  private getObedienceRules(): ValidationRule[] {
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

  private getRallyRules(): ValidationRule[] {
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

  private getConformationRules(): ValidationRule[] {
    return [
      {
        field: 'pointsAwarded',
        rule: 'range',
        parameters: { min: 0, max: 10 },
        errorMessage: 'Points awarded must be between 0 and 10'
      }
    ];
  }

  private getTrackingRules(): ValidationRule[] {
    return [
      {
        field: 'articlesFound',
        rule: 'range',
        parameters: { min: 0, max: 10 },
        errorMessage: 'Articles found must be between 0 and 10'
      }
    ];
  }

  private getLureCoursingRules(): ValidationRule[] {
    return [
      {
        field: 'totalScore',
        rule: 'range',
        parameters: { min: 0, max: 125 }, // 5 categories × 25 points each
        errorMessage: 'Total score must be between 0 and 125'
      }
    ];
  }

  private getBarnHuntRules(): ValidationRule[] {
    return [
      {
        field: 'ratsFound',
        rule: 'range',
        parameters: { min: 0, max: 10 },
        errorMessage: 'Rats found must be between 0 and 10'
      }
    ];
  }

  private getFastCatRules(): ValidationRule[] {
    return [
      {
        field: 'speed',
        rule: 'range',
        parameters: { min: 0, max: 50 }, // mph
        errorMessage: 'Speed must be between 0 and 50 mph'
      }
    ];
  }

  private getDockDivingRules(): ValidationRule[] {
    return [
      {
        field: 'distance',
        rule: 'range',
        parameters: { min: 0, max: 50 }, // feet
        errorMessage: 'Distance must be between 0 and 50 feet'
      }
    ];
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

  private getMaxReasonableTime(format: ScoringFormat): number {
    // Return maximum reasonable times in milliseconds
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

  // ========================================================================
  // Public API Methods
  // ========================================================================

  /**
   * Add custom validation rules for a format
   */
  addCustomRules(format: ScoringFormat, rules: ValidationRule[]): void {
    const existing = this.config.customRules.get(format) || [];
    this.config.customRules.set(format, [...existing, ...rules]);

    // Update validation rules
    const validation = this.validationRules.get(format);
    if (validation) {
      validation.rules.push(...rules);
    }
  }

  /**
   * Get validation rules for a format
   */
  getValidationRules(format: ScoringFormat): ValidationRule[] {
    const validation = this.validationRules.get(format);
    return validation ? [...validation.rules] : [];
  }

  /**
   * Check if real-time validation is enabled
   */
  isRealTimeValidationEnabled(): boolean {
    return this.config.enableRealTimeValidation;
  }

  /**
   * Update validation configuration
   */
  updateConfig(config: Partial<ValidatorConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// Singleton instance
export const scoreValidatorService = new ScoreValidatorService();