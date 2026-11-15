import { describe, expect, it } from 'vitest';
import { excusedReasonsFor, nqReasonsFor, startingReasonFor } from './resultReasons';

// MYK9-2008: each registry's reason lists, from docs/rulebooks/.

describe('reason lists per registry', () => {
  it('AKC keeps the lists its sheet has always offered', () => {
    expect(nqReasonsFor('AKC_SCENT_WORK')).toEqual([
      'Incorrect Call',
      'Max Time',
      'Point to Hide',
      'Harsh Correction',
      'Significant Disruption',
    ]);
    expect(excusedReasonsFor('AKC_SCENT_WORK')).toEqual([
      'Dog Eliminated in Area',
      'Handler Request',
      'Out of Control',
      'Overly Stressed',
      'Other',
    ]);
  });

  it('UKC follows the Nose Work rulebook (Chapter 3 Sections 9 to 11)', () => {
    expect(nqReasonsFor('UKC_NOSEWORK')).toEqual([
      'Incorrect Call',
      'Max Time',
      'Fault Limit',
      'False Alert',
      'Prior to Alert',
      'Missed Indication',
      'Handler Stopped Search',
      'Handler Error',
    ]);
    expect(excusedReasonsFor('UKC_NOSEWORK')).toEqual([
      'Dog Eliminated in Area',
      'Handler Request',
      'Out of Control',
      'Aggression',
      'Reactive Dog',
      'Stress or Fear',
      'Lame, Ill or in Season',
      'Poor Sportsmanship',
      'Double Handling',
    ]);
  });

  it('ASCA follows the Scent Detection rules 9.2 and 9.3', () => {
    expect(nqReasonsFor('ASCA_SCENT_DETECTION')).toEqual([
      'Incorrect Call',
      'Max Time',
      'Dog Eliminated in Area',
      'Dog Stopped Working',
      'Destroyed Containers',
      'Excessive Disturbance',
      'Damaged Property',
      "Couldn't Point to Hide",
      'Fault Limit',
      'False Alert',
    ]);
    expect(excusedReasonsFor('ASCA_SCENT_DETECTION')).toEqual([
      'Extreme Stress/Fear/Aggression',
      'Harsh Handling',
      'Poor Sportsmanship',
      'Revealed Hide Location',
    ]);
  });

  it.each(['AKC_SCENT_WORK', 'UKC_NOSEWORK', 'ASCA_SCENT_DETECTION'] as const)(
    '%s lists the words the timer writes, so a timed-out NQ shows as chosen',
    sport => {
      expect(nqReasonsFor(sport)).toContain('Max Time');
      expect(nqReasonsFor(sport)).toContain(startingReasonFor(sport, 'NQ'));
    }
  );

  it('a sheet with no list of its own falls back to the AKC words', () => {
    expect(nqReasonsFor(undefined)).toEqual(nqReasonsFor('AKC_SCENT_WORK'));
  });
});

describe('the reason a result starts with', () => {
  it('NQ starts with Incorrect Call on every registry, UKC included', () => {
    for (const sport of ['AKC_SCENT_WORK', 'UKC_NOSEWORK', 'ASCA_SCENT_DETECTION'] as const) {
      expect(startingReasonFor(sport, 'NQ')).toBe('Incorrect Call');
    }
  });

  it('Excused starts with Dog Eliminated in Area on AKC, and with none on UKC and ASCA', () => {
    expect(startingReasonFor('AKC_SCENT_WORK', 'EX')).toBe('Dog Eliminated in Area');
    expect(startingReasonFor('UKC_NOSEWORK', 'EX')).toBe('');
    expect(startingReasonFor('ASCA_SCENT_DETECTION', 'EX')).toBe('');
  });

  it('Absent reads Absent, and Qualified and DQ start empty', () => {
    expect(startingReasonFor('UKC_NOSEWORK', 'ABS')).toBe('Absent');
    expect(startingReasonFor('UKC_NOSEWORK', 'Q')).toBe('');
    expect(startingReasonFor('UKC_NOSEWORK', 'DQ')).toBe('');
  });
});
