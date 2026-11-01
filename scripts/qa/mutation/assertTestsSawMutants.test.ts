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
    expect(() => assertTestsSawMutants('placement', report(mixed))).toThrow(
      /20 survived mutants ran zero tests/
    );
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

describe('assertTestsSawMutants partly blind targets', () => {
  const healthy = Array.from({ length: 10 }, () => ({ status: 'Survived', testsCompleted: 2 }));

  it('fails on one survivor that ran zero tests among healthy ones, naming file:line', () => {
    const blind = { status: 'Survived', testsCompleted: 0, location: { start: { line: 42 } } };
    expect(() => assertTestsSawMutants('placement', report([...healthy, blind]))).toThrow(
      /1 survived mutants ran zero tests \(e\.g\. a\.ts:42\)/
    );
  });

  it('fails on a survivor with undefined testsCompleted', () => {
    expect(() =>
      assertTestsSawMutants('placement', report([...healthy, { status: 'Survived' }]))
    ).toThrow(/ran zero tests/);
  });

  it('passes the healthy shape and exempts Timeout', () => {
    expect(() =>
      assertTestsSawMutants('placement', report([...healthy, { status: 'Timeout' }]))
    ).not.toThrow();
  });
});
