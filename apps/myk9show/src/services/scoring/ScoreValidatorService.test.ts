import { describe, expect, it } from 'vitest';

import { ScoreValidatorService } from './ScoreValidatorService';
import type { BaseScore, ValidationRule } from '@/types/scoring-types';

function baseScore(overrides: Partial<BaseScore> & Record<string, unknown> = {}): BaseScore {
  const now = new Date();

  return {
    entryId: 'entry-1',
    classId: 'class-1',
    judgeId: 'judge-1',
    format: 'scent_work',
    qualification: 'Qualified',
    timestamp: now,
    recordedBy: 'judge-1',
    recordedAt: now,
    version: 1,
    lastModified: now,
    syncStatus: 'synced',
    searchTime: 12_000,
    maxTimeAllowed: 180_000,
    faults: 0,
    ...overrides,
  } as BaseScore;
}

describe('ScoreValidatorService', () => {
  it('rejects missing required identity fields and blank judge ids', async () => {
    const service = new ScoreValidatorService();
    const result = await service.validateScore(baseScore({ entryId: '', judgeId: '' }));

    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'entryId', code: 'REQUIRED_FIELD' }),
        expect.objectContaining({ field: 'judgeId', code: 'REQUIRED_FIELD' }),
        expect.objectContaining({ field: 'judgeId', code: 'INVALID_JUDGE' }),
      ])
    );
  });

  it('rejects scent work search times outside the configured range', async () => {
    const service = new ScoreValidatorService();
    const result = await service.validateScore(baseScore({ searchTime: 600_001 } as BaseScore));

    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: 'searchTime',
        code: 'OUT_OF_RANGE',
        message: 'Search time must be between 0 and 10 minutes',
      })
    );
  });

  it('rejects unsupported scoring formats before applying format rules', async () => {
    const service = new ScoreValidatorService();
    const result = await service.validateScore(
      baseScore({ format: 'unknown_format' } as BaseScore)
    );

    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual([
      expect.objectContaining({
        field: 'format',
        code: 'UNSUPPORTED_FORMAT',
        message: 'Unsupported scoring format: unknown_format',
      }),
    ]);
  });

  it('validates only critical required and range rules during real-time checks', async () => {
    const service = new ScoreValidatorService();
    const result = await service.validateRealTime({
      format: 'scent_work',
      entryId: '',
      searchTime: 600_001,
    } as Partial<BaseScore>);

    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'entryId', code: 'REQUIRED_FIELD' }),
        expect.objectContaining({ field: 'searchTime', code: 'OUT_OF_RANGE' }),
      ])
    );
    expect(result.errors).not.toContainEqual(
      expect.objectContaining({ field: 'judgeId', code: 'INVALID_JUDGE' })
    );
  });

  it('skips real-time validation when disabled', async () => {
    const service = new ScoreValidatorService({ enableRealTimeValidation: false });
    const result = await service.validateRealTime({
      format: 'scent_work',
      entryId: '',
      searchTime: 600_001,
    } as Partial<BaseScore>);

    expect(result).toEqual({ isValid: true, errors: [], warnings: [] });
  });

  it('applies custom rules added for a scoring format', async () => {
    const service = new ScoreValidatorService();
    const dogIdRequired: ValidationRule = {
      field: 'dogId',
      rule: 'required',
      errorMessage: 'Dog ID is required for this format',
    };

    service.addCustomRules('scent_work', [dogIdRequired]);

    const result = await service.validateScore(baseScore());

    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: 'dogId',
        code: 'REQUIRED_FIELD',
        message: 'Dog ID is required for this format',
      })
    );
  });

  it('applies dependency custom rules for cross-field requirements', async () => {
    const service = new ScoreValidatorService();
    service.addCustomRules('scent_work', [
      {
        field: 'judgeNotes',
        rule: 'dependency',
        parameters: {
          dependsOn: 'qualification',
          condition: 'equals',
          expectedValue: 'Excused',
        },
        errorMessage: 'Judge notes are required for excused entries',
      },
    ]);

    const result = await service.validateScore(
      baseScore({ qualification: 'Excused', searchTime: 0 })
    );

    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: 'judgeNotes',
        code: 'DEPENDENCY_VIOLATION',
        message: 'Judge notes are required for excused entries',
      })
    );
  });

  it('applies custom format rules to string fields', async () => {
    const service = new ScoreValidatorService();
    service.addCustomRules('scent_work', [
      {
        field: 'dogId',
        rule: 'format',
        parameters: { pattern: '^DOG-[0-9]+$' },
        errorMessage: 'Dog ID must use the DOG-#### format',
      },
    ]);

    const invalid = await service.validateScore(baseScore({ dogId: 'bad-id' }));
    const valid = await service.validateScore(baseScore({ dogId: 'DOG-1234' }));

    expect(invalid.isValid).toBe(false);
    expect(invalid.errors).toContainEqual(
      expect.objectContaining({
        field: 'dogId',
        code: 'INVALID_FORMAT',
        message: 'Dog ID must use the DOG-#### format',
      })
    );
    expect(valid.errors).not.toContainEqual(expect.objectContaining({ field: 'dogId' }));
  });

  it('supports dependency conditions beyond equals', async () => {
    const service = new ScoreValidatorService();
    service.addCustomRules('scent_work', [
      {
        field: 'judgeNotes',
        rule: 'dependency',
        parameters: {
          dependsOn: 'qualification',
          condition: 'not_equals',
          expectedValue: 'Qualified',
        },
        errorMessage: 'Judge notes are required unless qualified',
      },
      {
        field: 'dogId',
        rule: 'dependency',
        parameters: { dependsOn: 'judgeId', condition: 'exists' },
        errorMessage: 'Dog ID is required once a judge is assigned',
      },
      {
        field: 'recordedBy',
        rule: 'dependency',
        parameters: { dependsOn: 'reviewedAt', condition: 'not_exists' },
        errorMessage: 'Unreviewed scores need a recorder',
      },
    ]);

    const result = await service.validateScore(
      baseScore({ qualification: 'Absent', searchTime: 0, dogId: undefined, recordedBy: '' })
    );

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'judgeNotes',
          code: 'DEPENDENCY_VIOLATION',
        }),
        expect.objectContaining({
          field: 'dogId',
          code: 'DEPENDENCY_VIOLATION',
        }),
        expect.objectContaining({
          field: 'recordedBy',
          code: 'DEPENDENCY_VIOLATION',
        }),
      ])
    );
  });

  it('rejects scores recorded in the future', async () => {
    const service = new ScoreValidatorService();
    const result = await service.validateScore(
      baseScore({ recordedAt: new Date(Date.now() + 60_000) })
    );

    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'recordedAt', code: 'FUTURE_TIMESTAMP' })
    );
  });

  it('allows future timestamps when business rule validation is disabled', async () => {
    const service = new ScoreValidatorService({ enableBusinessRuleValidation: false });
    const result = await service.validateScore(
      baseScore({ recordedAt: new Date(Date.now() + 60_000) })
    );

    expect(result.errors).not.toContainEqual(
      expect.objectContaining({ field: 'recordedAt', code: 'FUTURE_TIMESTAMP' })
    );
  });

  it('warns when score timestamps are more than a year old', async () => {
    const service = new ScoreValidatorService();
    const result = await service.validateScore(
      baseScore({ recordedAt: new Date(Date.now() - 366 * 24 * 60 * 60 * 1000) })
    );

    expect(result.isValid).toBe(true);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        field: 'recordedAt',
        message: 'Score timestamp is over a year old',
      })
    );
  });

  it('warns for suspiciously fast qualified times but not non-qualifying times', async () => {
    const service = new ScoreValidatorService();
    const qualified = await service.validateScore(baseScore({ searchTime: 999 }));
    const notQualified = await service.validateScore(
      baseScore({ qualification: 'Not Qualified', searchTime: 999, judgeNotes: 'Missed hide' })
    );

    expect(qualified.warnings).toContainEqual(
      expect.objectContaining({
        field: 'time',
        message: 'Very fast time - please verify accuracy',
      })
    );
    expect(notQualified.warnings).not.toContainEqual(expect.objectContaining({ field: 'time' }));
  });

  it('warns for unusually long rally course times', async () => {
    const service = new ScoreValidatorService();
    const result = await service.validateScore(
      baseScore({
        format: 'rally',
        courseTime: 700_000,
        stationDeductions: 3,
        lackOfControl: 0,
        repeatStation: 0,
        totalDeductions: 3,
        finalScore: 207,
        qualifyingScore: 170,
        isQualifying: true,
      })
    );

    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        field: 'time',
        message: 'Unusually long time - please verify accuracy',
      })
    );
  });

  it('warns when absent or withdrawn entries still carry score data', async () => {
    const service = new ScoreValidatorService();
    const result = await service.validateScore(
      baseScore({
        qualification: 'Absent',
        searchTime: 12_000,
        judgeNotes: 'No show',
      })
    );

    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        field: 'qualification',
        message: 'Absent/Withdrawn entry has scoring data',
      })
    );
  });

  it('checks required qualified score data across agility, obedience, and rally', async () => {
    const service = new ScoreValidatorService();
    const agility = await service.validateScore(
      baseScore({
        format: 'agility',
        courseTime: 0,
        jumpFaults: 0,
        refusals: 0,
        otherFaults: 0,
        totalFaults: 0,
      })
    );
    const obedience = await service.validateScore(
      baseScore({
        format: 'obedience',
        totalScore: 0,
        maximumScore: 200,
        qualifyingScore: 170,
        exercises: [],
      })
    );
    const rally = await service.validateScore(
      baseScore({
        format: 'rally',
        courseTime: 45_000,
        stationDeductions: 210,
        lackOfControl: 0,
        repeatStation: 0,
        totalDeductions: 210,
        finalScore: 0,
        qualifyingScore: 170,
        isQualifying: false,
      })
    );

    expect(agility.warnings).toContainEqual(
      expect.objectContaining({
        field: 'qualification',
        message: 'Qualified entry missing: course time',
      })
    );
    expect(obedience.warnings).toContainEqual(
      expect.objectContaining({
        field: 'qualification',
        message: 'Qualified entry missing: total score, exercise scores',
      })
    );
    expect(rally.warnings).toContainEqual(
      expect.objectContaining({
        field: 'qualification',
        message: 'Qualified entry missing: final score',
      })
    );
  });

  it('warns when qualified scent-work scores are missing required scoring data', async () => {
    const service = new ScoreValidatorService();
    const result = await service.validateScore(baseScore({ searchTime: undefined }));

    expect(result.isValid).toBe(true);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        field: 'qualification',
        message: 'Qualified entry missing: search time',
      })
    );
  });

  it('warns when a not-qualified score has no reason or notes', async () => {
    const service = new ScoreValidatorService();
    const result = await service.validateScore(
      baseScore({ qualification: 'Not Qualified', searchTime: 0 })
    );

    expect(result.isValid).toBe(true);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        field: 'qualificationReason',
        message: 'Non-qualifying entry should have a reason',
      })
    );
  });

  it('does not warn for non-qualifying scores with a reason', async () => {
    const service = new ScoreValidatorService();
    const result = await service.validateScore(
      baseScore({
        qualification: 'Not Qualified',
        searchTime: 0,
        qualificationReason: 'Missed hide',
      })
    );

    expect(result.warnings).not.toContainEqual(
      expect.objectContaining({ field: 'qualificationReason' })
    );
  });

  it('warns when excused or withdrawn entries have no judge notes', async () => {
    const service = new ScoreValidatorService();
    const result = await service.validateScore(
      baseScore({ qualification: 'Withdrawn', searchTime: 0 })
    );

    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        field: 'judgeNotes',
        message: 'Excused/Withdrawn entry should have explanation',
      })
    );
  });

  it('rejects whitespace-only judge ids', async () => {
    const service = new ScoreValidatorService();
    const result = await service.validateScore(baseScore({ judgeId: '   ' }));

    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: 'judgeId',
        code: 'INVALID_JUDGE',
      })
    );
  });

  it('keys batch validation results by entry, class, and judge', async () => {
    const service = new ScoreValidatorService();
    const results = await service.validateScores([
      baseScore({ entryId: 'entry-1', classId: 'class-1', judgeId: 'judge-1' }),
      baseScore({ entryId: 'entry-2', classId: 'class-1', judgeId: 'judge-2' }),
    ]);

    expect([...results.keys()]).toEqual(['entry-1-class-1-judge-1', 'entry-2-class-1-judge-2']);
    expect(results.get('entry-1-class-1-judge-1')?.isValid).toBe(true);
    expect(results.get('entry-2-class-1-judge-2')?.isValid).toBe(true);
  });

  it('exposes copied validation rules and mutable config flags', async () => {
    const service = new ScoreValidatorService();
    const rules = service.getValidationRules('scent_work');

    rules.length = 0;
    service.updateConfig({ enableRealTimeValidation: false });

    expect(service.getValidationRules('scent_work').length).toBeGreaterThan(0);
    expect(service.isRealTimeValidationEnabled()).toBe(false);
  });
});
