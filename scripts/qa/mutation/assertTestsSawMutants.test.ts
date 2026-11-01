import { describe, expect, it } from 'vitest';

import { assertTestsSawMutants, type MutationReport } from './assertTestsSawMutants';
import { widenTestNamePattern } from './vitestNamePatternShim';

function report(mutants: Array<{ status: string; testsCompleted?: number }>): MutationReport {
  return { files: { 'a.ts': { mutants } } };
}

const survivedWithoutRunningTests = Array.from({ length: 20 }, () => ({
  status: 'Survived',
  testsCompleted: 0,
}));

describe('assertTestsSawMutants', () => {
  it('fails loudly when covered mutants survive without running a test (the placement 0 of 314 shape)', () => {
    expect(() => assertTestsSawMutants('placement', report(survivedWithoutRunningTests))).toThrow(
      /placement.*ran zero tests/
    );
  });

  it('fails when a target has too few covered mutants to mean anything', () => {
    expect(() =>
      assertTestsSawMutants('cart', report([{ status: 'Killed', testsCompleted: 1 }]))
    ).toThrow(/only 1 covered mutants/);
  });

  it('ignores mutants Stryker never runs, so NoCoverage cannot hide a blind target', () => {
    const mixed = [
      ...survivedWithoutRunningTests,
      ...Array.from({ length: 50 }, () => ({ status: 'NoCoverage', testsCompleted: 0 })),
    ];
    expect(() => assertTestsSawMutants('placement', report(mixed))).toThrow(/20 covered mutants/);
  });

  it('passes when mutants are killed by running tests', () => {
    const healthy = Array.from({ length: 10 }, () => ({ status: 'Killed', testsCompleted: 2 }));
    expect(() => assertTestsSawMutants('placement', report(healthy))).not.toThrow();
  });
});

describe('widenTestNamePattern', () => {
  const stryker = new RegExp(['suite does a thing', 'suite other'].join('|'));

  it('matches the " > " joined full test name Vitest 4+ uses, which Stryker pattern alone misses', () => {
    expect(stryker.test('suite > does a thing')).toBe(false);
    const widened = widenTestNamePattern(stryker);
    expect(widened.test('suite > does a thing')).toBe(true);
    expect(widened.test('suite > other')).toBe(true);
  });

  it('still matches a space-joined name and does not match an unrelated test', () => {
    const widened = widenTestNamePattern(stryker);
    expect(widened.test('suite does a thing')).toBe(true);
    expect(widened.test('suite > unrelated')).toBe(false);
  });
});
