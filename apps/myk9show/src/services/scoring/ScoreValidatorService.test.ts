import { describe, expect, it } from 'vitest';

import { ScoreValidatorService } from './ScoreValidatorService';
import type { BaseScore, ValidationRule } from '@/types/scoring-types';

function baseScore(overrides: Partial<BaseScore> = {}): BaseScore {
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
});
