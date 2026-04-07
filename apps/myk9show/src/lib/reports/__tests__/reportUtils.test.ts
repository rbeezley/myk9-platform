import { describe, it, expect } from 'vitest';
import {
  formatReportDate,
  formatReportTime,
  formatTimeLimit,
  sortByRunOrder,
  sortByArmband,
  sortByPlacement,
  getPlacementText,
  getResultStatusText,
  isQualified,
  countQualified,
  getOrgTitle,
  mapDbEntryToReportEntry,
} from '../reportUtils';
import type { ReportEntry } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<ReportEntry> = {}): ReportEntry {
  return {
    id: 'e1',
    armband: 100,
    runOrder: null,
    callName: 'Buddy',
    breed: 'Labrador Retriever',
    handler: 'Jane Doe',
    registrationNumber: 'AKC123',
    checkInStatus: null,
    section: null,
    isScored: false,
    resultText: null,
    searchTimeSeconds: null,
    totalFaults: null,
    finalPlacement: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// formatReportDate
// ---------------------------------------------------------------------------

describe('formatReportDate', () => {
  it('formats ISO date to m/d/yyyy', () => {
    expect(formatReportDate('2026-04-12')).toBe('4/12/2026');
  });

  it('does not zero-pad month or day', () => {
    expect(formatReportDate('2026-01-05')).toBe('1/5/2026');
  });

  it('handles December 31', () => {
    expect(formatReportDate('2025-12-31')).toBe('12/31/2025');
  });
});

// ---------------------------------------------------------------------------
// formatReportTime
// ---------------------------------------------------------------------------

describe('formatReportTime', () => {
  it('formats seconds to mm:ss.hh', () => {
    expect(formatReportTime(1.76)).toBe('00:01.76');
  });

  it('formats larger values', () => {
    expect(formatReportTime(65.5)).toBe('01:05.50');
  });

  it('handles exact seconds', () => {
    expect(formatReportTime(30)).toBe('00:30.00');
  });

  it('returns empty string for null', () => {
    expect(formatReportTime(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(formatReportTime(undefined)).toBe('');
  });

  it('returns empty string for 0', () => {
    expect(formatReportTime(0)).toBe('');
  });

  it('handles string input', () => {
    expect(formatReportTime('1.76')).toBe('00:01.76');
  });

  it('returns empty string for non-numeric string', () => {
    expect(formatReportTime('abc')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// formatTimeLimit
// ---------------------------------------------------------------------------

describe('formatTimeLimit', () => {
  it('formats even minutes', () => {
    expect(formatTimeLimit(120)).toBe('2 min');
  });

  it('formats minutes with remaining seconds', () => {
    expect(formatTimeLimit(150)).toBe('2:30');
  });

  it('returns empty string for undefined', () => {
    expect(formatTimeLimit(undefined)).toBe('');
  });

  it('returns empty string for null', () => {
    expect(formatTimeLimit(null)).toBe('');
  });

  it('returns empty string for 0', () => {
    expect(formatTimeLimit(0)).toBe('');
  });

  it('formats single-digit seconds with zero padding', () => {
    expect(formatTimeLimit(65)).toBe('1:05');
  });
});

// ---------------------------------------------------------------------------
// sortByRunOrder
// ---------------------------------------------------------------------------

describe('sortByRunOrder', () => {
  it('sorts by runOrder ascending', () => {
    const entries = [
      makeEntry({ id: 'a', armband: 200, runOrder: 3 }),
      makeEntry({ id: 'b', armband: 100, runOrder: 1 }),
      makeEntry({ id: 'c', armband: 150, runOrder: 2 }),
    ];
    const sorted = sortByRunOrder(entries);
    expect(sorted.map(e => e.id)).toEqual(['b', 'c', 'a']);
  });

  it('falls back to armband when runOrder is null', () => {
    const entries = [
      makeEntry({ id: 'a', armband: 300, runOrder: null }),
      makeEntry({ id: 'b', armband: 100, runOrder: null }),
    ];
    const sorted = sortByRunOrder(entries);
    expect(sorted.map(e => e.id)).toEqual(['b', 'a']);
  });

  it('does not mutate the input array', () => {
    const entries = [
      makeEntry({ id: 'a', armband: 200, runOrder: 2 }),
      makeEntry({ id: 'b', armband: 100, runOrder: 1 }),
    ];
    const original = [...entries];
    sortByRunOrder(entries);
    expect(entries.map(e => e.id)).toEqual(original.map(e => e.id));
  });
});

// ---------------------------------------------------------------------------
// sortByArmband
// ---------------------------------------------------------------------------

describe('sortByArmband', () => {
  it('sorts by armband ascending', () => {
    const entries = [
      makeEntry({ id: 'a', armband: 300 }),
      makeEntry({ id: 'b', armband: 100 }),
      makeEntry({ id: 'c', armband: 200 }),
    ];
    const sorted = sortByArmband(entries);
    expect(sorted.map(e => e.id)).toEqual(['b', 'c', 'a']);
  });

  it('does not mutate the input array', () => {
    const entries = [makeEntry({ id: 'a', armband: 300 }), makeEntry({ id: 'b', armband: 100 })];
    const original = [...entries];
    sortByArmband(entries);
    expect(entries.map(e => e.id)).toEqual(original.map(e => e.id));
  });
});

// ---------------------------------------------------------------------------
// sortByPlacement
// ---------------------------------------------------------------------------

describe('sortByPlacement', () => {
  it('places qualified entries before non-qualified', () => {
    const entries = [
      makeEntry({ id: 'nq', resultText: 'nq', finalPlacement: 9996 }),
      makeEntry({ id: 'q1', resultText: 'qualified', finalPlacement: 1 }),
    ];
    const sorted = sortByPlacement(entries);
    expect(sorted.map(e => e.id)).toEqual(['q1', 'nq']);
  });

  it('sorts qualified by placement number', () => {
    const entries = [
      makeEntry({ id: 'q3', resultText: 'q', finalPlacement: 3 }),
      makeEntry({ id: 'q1', resultText: 'qualified', finalPlacement: 1 }),
      makeEntry({ id: 'q2', resultText: 'q', finalPlacement: 2 }),
    ];
    const sorted = sortByPlacement(entries);
    expect(sorted.map(e => e.id)).toEqual(['q1', 'q2', 'q3']);
  });

  it('sorts non-qualified: absent > excused > NQ', () => {
    const entries = [
      makeEntry({ id: 'nq', resultText: 'nq', armband: 100 }),
      makeEntry({ id: 'exc', resultText: 'excused', armband: 101 }),
      makeEntry({ id: 'abs', resultText: 'absent', armband: 102 }),
    ];
    const sorted = sortByPlacement(entries);
    expect(sorted.map(e => e.id)).toEqual(['abs', 'exc', 'nq']);
  });

  it('sorts same-status entries by armband', () => {
    const entries = [
      makeEntry({ id: 'nq2', resultText: 'nq', armband: 200 }),
      makeEntry({ id: 'nq1', resultText: 'nq', armband: 100 }),
    ];
    const sorted = sortByPlacement(entries);
    expect(sorted.map(e => e.id)).toEqual(['nq1', 'nq2']);
  });

  it('does not mutate the input array', () => {
    const entries = [
      makeEntry({ id: 'nq', resultText: 'nq' }),
      makeEntry({ id: 'q', resultText: 'q', finalPlacement: 1 }),
    ];
    const original = [...entries];
    sortByPlacement(entries);
    expect(entries.map(e => e.id)).toEqual(original.map(e => e.id));
  });
});

// ---------------------------------------------------------------------------
// getPlacementText
// ---------------------------------------------------------------------------

describe('getPlacementText', () => {
  it('returns number for qualified placements', () => {
    expect(getPlacementText(makeEntry({ finalPlacement: 1 }))).toBe('1');
    expect(getPlacementText(makeEntry({ finalPlacement: 5 }))).toBe('5');
  });

  it('returns NQ for 9996', () => {
    expect(getPlacementText(makeEntry({ finalPlacement: 9996 }))).toBe('NQ');
  });

  it('returns ABS for 9997', () => {
    expect(getPlacementText(makeEntry({ finalPlacement: 9997 }))).toBe('ABS');
  });

  it('returns EX for 9998', () => {
    expect(getPlacementText(makeEntry({ finalPlacement: 9998 }))).toBe('EX');
  });

  it('returns WD for 9999', () => {
    expect(getPlacementText(makeEntry({ finalPlacement: 9999 }))).toBe('WD');
  });

  it('returns DQ for 10000', () => {
    expect(getPlacementText(makeEntry({ finalPlacement: 10000 }))).toBe('DQ');
  });

  it('returns EXC for 9995', () => {
    expect(getPlacementText(makeEntry({ finalPlacement: 9995 }))).toBe('EXC');
  });

  it('returns COMP for 10001', () => {
    expect(getPlacementText(makeEntry({ finalPlacement: 10001 }))).toBe('COMP');
  });

  it('returns empty string for null placement', () => {
    expect(getPlacementText(makeEntry({ finalPlacement: null }))).toBe('');
  });
});

// ---------------------------------------------------------------------------
// getResultStatusText
// ---------------------------------------------------------------------------

describe('getResultStatusText', () => {
  it('returns Qualified for "q"', () => {
    expect(getResultStatusText(makeEntry({ resultText: 'q' }))).toBe('Qualified');
  });

  it('returns Qualified for "qualified"', () => {
    expect(getResultStatusText(makeEntry({ resultText: 'qualified' }))).toBe('Qualified');
  });

  it('returns NQ for "nq"', () => {
    expect(getResultStatusText(makeEntry({ resultText: 'nq' }))).toBe('NQ');
  });

  it('returns Absent for "absent"', () => {
    expect(getResultStatusText(makeEntry({ resultText: 'absent' }))).toBe('Absent');
  });

  it('returns Excused for "excused"', () => {
    expect(getResultStatusText(makeEntry({ resultText: 'excused' }))).toBe('Excused');
  });

  it('returns Withdrawn for "withdrawn"', () => {
    expect(getResultStatusText(makeEntry({ resultText: 'withdrawn' }))).toBe('Withdrawn');
  });

  it('returns empty string for null', () => {
    expect(getResultStatusText(makeEntry({ resultText: null }))).toBe('');
  });

  it('returns original text for unknown values', () => {
    expect(getResultStatusText(makeEntry({ resultText: 'SomethingElse' }))).toBe('SomethingElse');
  });
});

// ---------------------------------------------------------------------------
// isQualified
// ---------------------------------------------------------------------------

describe('isQualified', () => {
  it('returns true for "q"', () => {
    expect(isQualified(makeEntry({ resultText: 'q' }))).toBe(true);
  });

  it('returns true for "qualified"', () => {
    expect(isQualified(makeEntry({ resultText: 'qualified' }))).toBe(true);
  });

  it('returns false for "nq"', () => {
    expect(isQualified(makeEntry({ resultText: 'nq' }))).toBe(false);
  });

  it('returns false for null', () => {
    expect(isQualified(makeEntry({ resultText: null }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// countQualified
// ---------------------------------------------------------------------------

describe('countQualified', () => {
  it('counts qualified entries', () => {
    const entries = [
      makeEntry({ resultText: 'q' }),
      makeEntry({ resultText: 'nq' }),
      makeEntry({ resultText: 'qualified' }),
      makeEntry({ resultText: 'absent' }),
    ];
    expect(countQualified(entries)).toBe(2);
  });

  it('returns 0 for empty array', () => {
    expect(countQualified([])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getOrgTitle
// ---------------------------------------------------------------------------

describe('getOrgTitle', () => {
  it('returns AKC Scent Work for scent-related elements', () => {
    expect(getOrgTitle('Scent Work')).toBe('AKC Scent Work');
    expect(getOrgTitle('Nose Work')).toBe('AKC Scent Work');
  });

  it('returns UKC Rally for rally elements', () => {
    expect(getOrgTitle('Rally Obedience')).toBe('UKC Rally');
  });

  it('returns UKC Obedience for obedience elements', () => {
    expect(getOrgTitle('Obedience')).toBe('UKC Obedience');
  });

  it('returns UKC Agility for agility elements', () => {
    expect(getOrgTitle('Agility')).toBe('UKC Agility');
  });

  it('returns AKC FastCAT for fastcat elements', () => {
    expect(getOrgTitle('FastCAT')).toBe('AKC FastCAT');
  });

  it('returns Dog Sport for unknown elements', () => {
    expect(getOrgTitle('Unknown Sport')).toBe('Dog Sport');
  });

  it('returns empty string for undefined', () => {
    expect(getOrgTitle(undefined)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// mapDbEntryToReportEntry
// ---------------------------------------------------------------------------

describe('mapDbEntryToReportEntry', () => {
  it('maps all fields correctly', () => {
    const dbEntry = {
      id: 'entry-1',
      armband: 42,
      run_order: 3,
      check_in_status: 'checked_in',
      section: 'A',
      is_scored: true,
      result_status: 'qualified',
      search_time_seconds: 45.2,
      total_faults: 0,
      final_placement: 1,
    };
    const result = mapDbEntryToReportEntry(
      dbEntry,
      'Rex',
      'German Shepherd',
      'John Smith',
      'AKC456'
    );
    expect(result).toEqual({
      id: 'entry-1',
      armband: 42,
      runOrder: 3,
      callName: 'Rex',
      breed: 'German Shepherd',
      handler: 'John Smith',
      registrationNumber: 'AKC456',
      checkInStatus: 'checked_in',
      section: 'A',
      isScored: true,
      resultText: 'qualified',
      searchTimeSeconds: 45.2,
      totalFaults: 0,
      finalPlacement: 1,
    });
  });

  it('defaults null armband to 0', () => {
    const dbEntry = {
      id: 'entry-2',
      armband: null,
      run_order: null,
      check_in_status: null,
      section: null,
      is_scored: null,
      result_status: null,
      search_time_seconds: null,
      total_faults: null,
      final_placement: null,
    };
    const result = mapDbEntryToReportEntry(dbEntry, 'Spot', 'Dalmatian', 'Jane Doe', null);
    expect(result.armband).toBe(0);
    expect(result.isScored).toBe(false);
    expect(result.registrationNumber).toBeNull();
  });
});
