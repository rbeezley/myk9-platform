import { describe, it, expect } from 'vitest';
import { msToDisplay } from '@/lib/timeUtils';
import {
  shouldShowSection,
  formatClassTitle,
  buildClassConfig,
  buildClassStats,
  buildScentWorkEntries,
} from '../ClassDetailsMain.helpers';
import type { ClassData, EntryData } from '../types/classTypes';
import type { ScentWorkResult } from '@/types/scent-work-types';
import type { ValidationResult } from '@/types/scoring-types';
import { validateScentWorkScore } from '@/services/scoring/formatValidators';

describe('shouldShowSection', () => {
  it('returns true for Novice level with section', () => {
    expect(shouldShowSection({ element: 'Container', level: 'Novice', section: 'A' })).toBe(true);
    expect(shouldShowSection({ element: 'Interior', level: 'Novice', section: 'B' })).toBe(true);
  });

  it('returns true for Novice A/B variant levels', () => {
    expect(shouldShowSection({ element: 'Exterior', level: 'Novice A', section: 'A' })).toBe(true);
    expect(shouldShowSection({ element: 'Buried', level: 'Novice B', section: 'B' })).toBe(true);
  });

  it('returns false for Advanced level', () => {
    expect(shouldShowSection({ element: 'Container', level: 'Advanced', section: 'A' })).toBe(
      false
    );
  });

  it('returns false for Excellent level', () => {
    expect(shouldShowSection({ element: 'Interior', level: 'Excellent', section: 'A' })).toBe(
      false
    );
  });

  it('returns false for Master level', () => {
    expect(shouldShowSection({ element: 'Exterior', level: 'Master', section: 'A' })).toBe(false);
  });

  it('returns false for Masters level', () => {
    expect(shouldShowSection({ element: 'Buried', level: 'Masters', section: 'A' })).toBe(false);
  });

  it('returns false for Detective element regardless of other fields', () => {
    expect(shouldShowSection({ element: 'Detective', section: 'A' })).toBe(false);
    expect(shouldShowSection({ element: 'Detective', level: 'Novice', section: 'A' })).toBe(false);
  });

  it('returns false when section is empty or missing', () => {
    expect(shouldShowSection({ element: 'Container', level: 'Novice' })).toBe(false);
    expect(shouldShowSection({ element: 'Container', level: 'Novice', section: '' })).toBe(false);
    expect(shouldShowSection({ element: 'Container', level: 'Novice', section: undefined })).toBe(
      false
    );
  });

  it('returns false when level is missing', () => {
    expect(shouldShowSection({ element: 'Container', section: 'A' })).toBe(false);
  });
});

describe('formatClassTitle', () => {
  it('includes section for Novice level', () => {
    expect(
      formatClassTitle({
        id: '1',
        trialId: 't1',
        trial: 'T1',
        trialDate: '2026-01-01',
        trialNumber: '1',
        classOrder: '1',
        status: 'Scheduled',
        judge: 'J',
        element: 'Container',
        level: 'Novice',
        section: 'A',
      })
    ).toBe('Container Novice A');
  });

  it('excludes section for non-Novice level', () => {
    expect(
      formatClassTitle({
        id: '1',
        trialId: 't1',
        trial: 'T1',
        trialDate: '2026-01-01',
        trialNumber: '1',
        classOrder: '1',
        status: 'Scheduled',
        judge: 'J',
        element: 'Container',
        level: 'Advanced',
        section: 'A',
      })
    ).toBe('Container Advanced');
  });

  it('excludes section for Detective element', () => {
    expect(
      formatClassTitle({
        id: '1',
        trialId: 't1',
        trial: 'T1',
        trialDate: '2026-01-01',
        trialNumber: '1',
        classOrder: '1',
        status: 'Scheduled',
        judge: 'J',
        element: 'Detective',
        section: 'A',
      })
    ).toBe('Detective');
  });
});

describe('buildClassConfig time limit', () => {
  it('reads the M:SS limit as minutes and seconds, not as a seconds count', () => {
    const config = buildClassConfig({ timeLimit1: '05:00' } as ClassData);
    expect(config.timeLimit).toBe(300_000);
  });

  // MYK9-1095: no saved max time means no limit (0), never an invented 3:00 (#2894).
  it.each([
    ['missing', {}],
    ['blank', { timeLimit1: '' }],
    ['zero', { timeLimit1: '0:00' }],
  ])('reads a %s limit as no limit (0), not an invented 3:00', (_label, data) => {
    expect(buildClassConfig(data as ClassData).timeLimit).toBe(0);
  });

  it('carries no limit onto a stored result, so a 4:00 qualifier draws no over-time warning', async () => {
    const classData = { id: 'c1', entryFee: 0 } as ClassData;
    const config = buildClassConfig(classData);
    const [entry] = buildScentWorkEntries(
      [{ id: 'e1', dog: 'Rex', handler: 'H', score: '240', status: 'Qualified' } as EntryData],
      classData,
      config,
      []
    );
    const stored = entry?.judgingState?.currentResult;
    expect(stored?.maxTimeAllowed).toBe(0);

    const validation: ValidationResult = { isValid: true, errors: [], warnings: [] };
    await validateScentWorkScore(stored as ScentWorkResult, validation);
    expect(validation.warnings).toEqual([]);
  });
});

describe('buildClassStats with a Disqualified dog', () => {
  const entry = (status: string, extra: Record<string, unknown> = {}) =>
    ({ status, ...extra }) as unknown as Parameters<typeof buildClassStats>[0][number];

  it('counts a DQ as completed, not pending, and includes it in Other', () => {
    const stats = buildClassStats(
      [entry('Qualified'), entry('Disqualified'), entry('Excused'), entry('Pending')],
      true
    );
    expect(stats[0]).toMatchObject({ detail1: '3 completed', detail2: '1 pending' });
    expect(stats[1]).toMatchObject({ detail1: '1 Qualified', detail3: '2 Other' });
  });
});

describe('buildScentWorkEntries stored search time', () => {
  it.each([
    ['2.01', '0:02.01'],
    ['4.02', '0:04.02'],
  ])('stored %s s is integer ms and displays as %s', (score, expected) => {
    const classData = { id: 'c1', entryFee: 0 } as ClassData;
    const [entry] = buildScentWorkEntries(
      [{ id: 'e1', dog: 'Rex', handler: 'H', score, status: 'Qualified' } as EntryData],
      classData,
      buildClassConfig(classData),
      []
    );
    const ms = entry?.judgingState?.currentResult?.searchTime ?? Number.NaN;
    expect(Number.isInteger(ms)).toBe(true);
    expect(msToDisplay(ms, 'hundredths')).toBe(expected);
  });
});
