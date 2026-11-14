import { describe, it, expect } from 'vitest';
import { faultLimitFor, qualifiedFaultProblem, qualifiedTimeProblems } from './qualifiedCheck';
import type { ResolvedClassRules } from '../types';

const rules: ResolvedClassRules = {
  areaCount: 1,
  timerMode: 'single',
  maxTimeSeconds: 180,
  hideCount: 1,
  hidesKnown: true,
  distractionCount: 0,
};
const times = (...t: string[]) => t.map(time => ({ time }));

describe('qualifiedTimeProblems', () => {
  it('asks for a time when blank or zero', () => {
    expect(qualifiedTimeProblems(times(''), rules)).toEqual(['Add a time to save a Qualified']);
    expect(qualifiedTimeProblems(times('0:00.00'), rules)).toEqual([
      'Add a time to save a Qualified',
    ]);
  });

  it('allows a time at exactly the limit and refuses a hundredth over', () => {
    expect(qualifiedTimeProblems(times('3:00.00'), rules)).toEqual([null]);
    expect(qualifiedTimeProblems(times('3:00.01'), rules)).toEqual([
      '3:00.01 is over the 3:00 limit. Fix the time, or choose NQ.',
    ]);
  });

  it('checks each area against its own limit', () => {
    const r = { ...rules, areaCount: 2, areaMaxTimeSeconds: [180, 120] };
    expect(qualifiedTimeProblems(times('2:30.00', '2:30.00'), r)).toEqual([
      null,
      '2:30 is over the 2:00 limit. Fix the time, or choose NQ.',
    ]);
  });

  it('has no ceiling for a class with no limit, but still wants a time', () => {
    const r = { ...rules, maxTimeSeconds: 0 };
    expect(qualifiedTimeProblems(times('9:00.00'), r)).toEqual([null]);
    expect(qualifiedTimeProblems(times(''), r)).toEqual(['Add a time to save a Qualified']);
  });

  it('leaves text that is not a time yet to the unresolved-time check', () => {
    expect(qualifiedTimeProblems(times('1:'), rules)).toEqual([null]);
  });
});

describe('faultLimitFor', () => {
  it('follows the rulebooks', () => {
    expect(faultLimitFor('UKC_NOSEWORK', 'Master')).toEqual({ max: 1, registry: 'UKC' });
    expect(faultLimitFor('ASCA_SCENT_DETECTION', 'Novice')?.max).toBe(2);
    expect(faultLimitFor('ASCA_SCENT_DETECTION', 'Open')?.max).toBe(2);
    expect(faultLimitFor('ASCA_SCENT_DETECTION', 'Advanced')?.max).toBe(1);
    expect(faultLimitFor('ASCA_SCENT_DETECTION', 'Excellent')?.max).toBe(1);
  });

  it('guesses nothing for AKC or an unknown ASCA level', () => {
    expect(faultLimitFor('AKC_SCENT_WORK', 'Novice')).toBeUndefined();
    expect(faultLimitFor('ASCA_SCENT_DETECTION', 'Mystery')).toBeUndefined();
    expect(faultLimitFor('ASCA_SCENT_DETECTION', undefined)).toBeUndefined();
  });
});

describe('qualifiedFaultProblem', () => {
  it('is quiet at the limit and speaks one over', () => {
    const limit = { max: 1, registry: 'UKC' };
    expect(qualifiedFaultProblem(1, limit)).toBeNull();
    expect(qualifiedFaultProblem(2, limit)).toBe(
      '2 faults is over the UKC limit of 1. Remove a fault, or choose NQ.'
    );
    expect(qualifiedFaultProblem(9, undefined)).toBeNull();
  });
});
