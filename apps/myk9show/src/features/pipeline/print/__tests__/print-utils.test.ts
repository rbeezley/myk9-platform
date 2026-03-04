import { describe, it, expect } from 'vitest';
import {
  formatReportDate,
  formatReportTime,
  sortByRunOrder,
  sortByArmband,
  sortByPlacement,
  getPlacementText,
  getResultStatusText,
  isQualified,
  countQualified,
} from '../print-utils';
import type { PrintReportEntry } from '../print-types';

function makeEntry(overrides: Partial<PrintReportEntry> = {}): PrintReportEntry {
  return {
    id: '1',
    armband: 100,
    runOrder: null,
    callName: 'Rex',
    breed: 'Labrador',
    handlerName: 'Jane Doe',
    isScored: false,
    resultText: null,
    placement: null,
    searchTimeSeconds: null,
    faultCount: null,
    ...overrides,
  };
}

describe('formatReportDate', () => {
  it('formats ISO date string', () => {
    expect(formatReportDate('2026-03-04')).toBe('3/4/2026');
  });

  it('strips time from ISO datetime', () => {
    expect(formatReportDate('2025-10-15T12:00:00Z')).toBe('10/15/2025');
  });

  it('handles single-digit months and days', () => {
    expect(formatReportDate('2026-01-02')).toBe('1/2/2026');
  });
});

describe('formatReportTime', () => {
  it('returns empty string for null', () => {
    expect(formatReportTime(null)).toBe('');
  });

  it('returns empty string for NaN', () => {
    expect(formatReportTime(NaN)).toBe('');
  });

  it('formats zero seconds', () => {
    expect(formatReportTime(0)).toBe('00:00.00');
  });

  it('formats fractional seconds', () => {
    expect(formatReportTime(1.76)).toBe('00:01.76');
  });

  it('formats seconds over 60', () => {
    expect(formatReportTime(125.5)).toBe('02:05.50');
  });
});

// formatTimeLimit is a re-export from @myk9/core (formatTimeLimitSeconds) — tested there

describe('sortByRunOrder', () => {
  it('sorts by runOrder then armband', () => {
    const entries = [
      makeEntry({ id: 'a', armband: 200, runOrder: 2 }),
      makeEntry({ id: 'b', armband: 100, runOrder: 1 }),
      makeEntry({ id: 'c', armband: 150, runOrder: null }),
    ];
    const sorted = sortByRunOrder(entries);
    // b: runOrder 1, a: runOrder 2, c: null runOrder falls back to armband 150
    expect(sorted.map(e => e.id)).toEqual(['b', 'a', 'c']);
  });
});

describe('sortByArmband', () => {
  it('sorts by armband number', () => {
    const entries = [
      makeEntry({ id: 'a', armband: 300 }),
      makeEntry({ id: 'b', armband: 100 }),
      makeEntry({ id: 'c', armband: 200 }),
    ];
    const sorted = sortByArmband(entries);
    expect(sorted.map(e => e.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('sortByPlacement', () => {
  it('puts qualified entries first sorted by placement', () => {
    const entries = [
      makeEntry({ id: 'nq', resultText: 'NQ', placement: 9996 }),
      makeEntry({ id: 'q2', resultText: 'Q', placement: 2 }),
      makeEntry({ id: 'q1', resultText: 'Q', placement: 1 }),
    ];
    const sorted = sortByPlacement(entries);
    expect(sorted.map(e => e.id)).toEqual(['q1', 'q2', 'nq']);
  });

  it('sorts non-qualified by status priority: Absent > Excused > NQ', () => {
    const entries = [
      makeEntry({ id: 'nq', resultText: 'NQ', armband: 100 }),
      makeEntry({ id: 'abs', resultText: 'Absent', armband: 200 }),
      makeEntry({ id: 'exc', resultText: 'Excused', armband: 300 }),
    ];
    const sorted = sortByPlacement(entries);
    expect(sorted.map(e => e.id)).toEqual(['abs', 'exc', 'nq']);
  });

  it('breaks ties by armband', () => {
    const entries = [
      makeEntry({ id: 'b', resultText: 'NQ', armband: 200 }),
      makeEntry({ id: 'a', resultText: 'NQ', armband: 100 }),
    ];
    const sorted = sortByPlacement(entries);
    expect(sorted.map(e => e.id)).toEqual(['a', 'b']);
  });
});

describe('getPlacementText', () => {
  it('returns empty string for null', () => {
    expect(getPlacementText(null)).toBe('');
  });

  it('returns number for normal placements', () => {
    expect(getPlacementText(1)).toBe('1');
    expect(getPlacementText(4)).toBe('4');
  });

  it('decodes sentinel codes', () => {
    expect(getPlacementText(9995)).toBe('EXC');
    expect(getPlacementText(9996)).toBe('NQ');
    expect(getPlacementText(9997)).toBe('ABS');
    expect(getPlacementText(9998)).toBe('EX');
    expect(getPlacementText(9999)).toBe('WD');
    expect(getPlacementText(10000)).toBe('DQ');
    expect(getPlacementText(10001)).toBe('COMP');
  });

  it('returns empty string for unknown sentinel', () => {
    expect(getPlacementText(9500)).toBe('');
  });
});

describe('getResultStatusText', () => {
  it('returns empty string for null', () => {
    expect(getResultStatusText(null)).toBe('');
  });

  it('normalizes qualified variants', () => {
    expect(getResultStatusText('Q')).toBe('Qualified');
    expect(getResultStatusText('qualified')).toBe('Qualified');
  });

  it('normalizes non-qualifying statuses', () => {
    expect(getResultStatusText('nq')).toBe('NQ');
    expect(getResultStatusText('absent')).toBe('Absent');
    expect(getResultStatusText('excused')).toBe('Excused');
    expect(getResultStatusText('withdrawn')).toBe('Withdrawn');
  });

  it('returns original text for unknown status', () => {
    expect(getResultStatusText('Custom')).toBe('Custom');
  });
});

describe('isQualified', () => {
  it('returns true for Q', () => {
    expect(isQualified('Q')).toBe(true);
  });

  it('returns true for qualified', () => {
    expect(isQualified('qualified')).toBe(true);
  });

  it('returns false for NQ', () => {
    expect(isQualified('NQ')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isQualified(null)).toBe(false);
  });
});

describe('countQualified', () => {
  it('counts qualified entries', () => {
    const entries = [
      makeEntry({ resultText: 'Q' }),
      makeEntry({ resultText: 'NQ' }),
      makeEntry({ resultText: 'Qualified' }),
      makeEntry({ resultText: null }),
    ];
    expect(countQualified(entries)).toBe(2);
  });

  it('returns 0 for empty array', () => {
    expect(countQualified([])).toBe(0);
  });
});
