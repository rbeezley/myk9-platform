import { describe, expect, it } from 'vitest';
import { formatOwnResultLine, formatResultTime } from './ownResultLine';

const RELEASED = '2026-11-14T18:00:00Z';

describe('formatResultTime', () => {
  it('reads minutes, seconds and hundredths', () => {
    expect(formatResultTime(52.4)).toBe('0:52.40');
    expect(formatResultTime(125.5)).toBe('2:05.50');
    expect(formatResultTime(59.999)).toBe('1:00.00');
  });
});

describe('formatOwnResultLine', () => {
  it('says status, time and place of the dogs that ran once released', () => {
    expect(
      formatOwnResultLine({
        resultStatus: 'qualified',
        searchTimeSeconds: 52.4,
        finalPlacement: 2,
        resultsReleasedAt: RELEASED,
        ranCount: 14,
      })
    ).toEqual({ text: 'Qualified, 0:52.40, 2nd of 14', isPreliminary: false });
  });

  it('makes no placement claim before release, and is preliminary', () => {
    expect(
      formatOwnResultLine({
        resultStatus: 'qualified',
        searchTimeSeconds: 52.4,
        finalPlacement: 2,
        resultsReleasedAt: null,
        ranCount: 14,
      })
    ).toEqual({ text: 'Qualified, 0:52.40', isPreliminary: true });
  });

  it('says the place alone when the field size is unknown or smaller than the place', () => {
    const base = {
      resultStatus: 'qualified',
      searchTimeSeconds: null,
      finalPlacement: 3,
      resultsReleasedAt: RELEASED,
    };
    expect(formatOwnResultLine({ ...base, ranCount: null })?.text).toBe('Qualified, 3rd');
    expect(formatOwnResultLine({ ...base, ranCount: 2 })?.text).toBe('Qualified, 3rd');
  });

  it('gives a non-qualifying result no placement', () => {
    expect(
      formatOwnResultLine({
        resultStatus: 'nq',
        searchTimeSeconds: 61,
        finalPlacement: 4,
        resultsReleasedAt: RELEASED,
        ranCount: 9,
      })?.text
    ).toBe('Did not qualify, 1:01.00');
  });

  it('has nothing to say for a pending or missing status', () => {
    const base = {
      searchTimeSeconds: null,
      finalPlacement: null,
      resultsReleasedAt: null,
      ranCount: null,
    };
    expect(formatOwnResultLine({ ...base, resultStatus: 'pending' })).toBeNull();
    expect(formatOwnResultLine({ ...base, resultStatus: null })).toBeNull();
  });
});

describe('formatOwnResultLine: absent and withdrawn', () => {
  it('keeps the badge abbreviations so a scored WD never reads as a withdrawn entry', () => {
    expect(
      formatOwnResultLine({
        resultStatus: 'withdrawn',
        searchTimeSeconds: null,
        finalPlacement: null,
        resultsReleasedAt: RELEASED,
        ranCount: 9,
      })?.text
    ).toBe('WD');
  });
});
