import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useScoringValidation } from './offlineScoringValidation';
import type { BaseScore } from '@/types/scoring-types';

function makeScore(overrides: Partial<BaseScore> = {}): BaseScore {
  return {
    entryId: 'entry-1',
    classId: 'class-1',
    judgeId: 'judge-1',
    format: 'scent_work',
    qualification: 'qualified',
    timestamp: new Date('2026-07-01T10:00:00.000Z'),
    recordedBy: 'judge-1',
    recordedAt: new Date('2026-07-01T10:00:00.000Z'),
    version: 1,
    lastModified: new Date('2026-07-01T10:00:00.000Z'),
    syncStatus: 'pending',
    ...overrides
  } as BaseScore;
}

describe('useScoringValidation', () => {
  it('returns valid for a complete, well-formed score', () => {
    const { result } = renderHook(() => useScoringValidation());
    const validation = result.current.validate(makeScore());

    expect(validation.isValid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('flags missing entryId, classId, judgeId, and format as required errors', () => {
    const { result } = renderHook(() => useScoringValidation());
    const validation = result.current.validate(
      makeScore({ entryId: '', classId: '', judgeId: '', format: '' as BaseScore['format'] })
    );

    expect(validation.isValid).toBe(false);
    const fields = validation.errors.map((e) => e.field);
    expect(fields).toEqual(
      expect.arrayContaining(['entryId', 'classId', 'judgeId', 'format'])
    );
    expect(validation.errors.every((e) => e.code === 'REQUIRED')).toBe(true);
  });

  it('warns when points fall below the format qualifying threshold', () => {
    const { result } = renderHook(() => useScoringValidation());
    // scent_work qualifyingThreshold is 1
    const validation = result.current.validate(makeScore({ points: 0 }));

    expect(validation.isValid).toBe(true);
    expect(validation.warnings).toHaveLength(1);
    expect(validation.warnings[0].field).toBe('points');
  });

  it('does not warn when points meet or exceed the qualifying threshold', () => {
    const { result } = renderHook(() => useScoringValidation());
    const validation = result.current.validate(makeScore({ points: 5 }));

    expect(validation.warnings).toHaveLength(0);
  });

  it('errors when faults are negative', () => {
    const { result } = renderHook(() => useScoringValidation());
    const validation = result.current.validate(makeScore({ faults: -1 }));

    expect(validation.isValid).toBe(false);
    expect(validation.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'faults', code: 'INVALID_VALUE' })
      ])
    );
  });

  it('does not error when faults are zero or positive', () => {
    const { result } = renderHook(() => useScoringValidation());
    const validation = result.current.validate(makeScore({ faults: 0 }));

    expect(validation.errors.some((e) => e.field === 'faults')).toBe(false);
  });

  it('skips format-specific rules when the format has no known configuration', () => {
    const { result } = renderHook(() => useScoringValidation());
    const validation = result.current.validate(
      makeScore({ format: 'not_a_real_format' as BaseScore['format'], faults: -5 })
    );

    // format itself is present so no REQUIRED error for it, and format-specific
    // faults check is skipped because there is no matching config.
    expect(validation.errors.some((e) => e.field === 'format')).toBe(false);
    expect(validation.errors.some((e) => e.field === 'faults')).toBe(false);
  });
});
