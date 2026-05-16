import { describe, expect, it } from 'vitest';
import {
  deriveGazetteEditionLabel,
  deriveMagazineEditionLabel,
  deriveShowAbbreviation,
  deriveShowCode,
  initialsOf,
} from './dispatch-helpers';

describe('initialsOf', () => {
  it('extracts uppercase first-letter initials from multi-word text', () => {
    expect(initialsOf('Bexar County Kennel Club', 6)).toBe('BCKC');
    expect(initialsOf('Spring Scent Work Trial', 4)).toBe('SSWT');
  });

  it('drops noise words (the, and, of, …)', () => {
    expect(initialsOf('Club of the Pacific Northwest', 6)).toBe('CPN');
    expect(initialsOf('Friends and Family Trial', 6)).toBe('FFT');
  });

  it('caps to maxChars', () => {
    expect(initialsOf('Spring Scent Work Trial', 2)).toBe('SS');
    expect(initialsOf('Spring Scent Work Trial', 3)).toBe('SSW');
  });

  it('returns a single-word slice when only one significant token', () => {
    expect(initialsOf('Heritage', 4)).toBe('HERI');
  });

  it('returns empty string for noise-only or empty input', () => {
    expect(initialsOf('the and of', 4)).toBe('');
    expect(initialsOf('', 4)).toBe('');
  });
});

describe('deriveShowCode', () => {
  it('produces BCKC.2026.SS for distinct club + show + date', () => {
    // The §1 review-fix bug: this used to receive identical args from
    // the dispatcher (clubName === showTitle === show.name). Now it
    // gets the real club from show.organization. This test pins the
    // expected output so a regression to the duplicate-arg shape would
    // surface as a wrong code.
    expect(
      deriveShowCode(
        'Bexar County Kennel Club',
        'Spring Scent Work Trial',
        '2026-06-12'
      )
    ).toBe('BCKC.2026.SS');
  });

  it('produces a collapsed code when club and show happen to be identical', () => {
    // Documents the degraded-but-defined behavior when the data model
    // really does pass the same string for both args. The bug §1 was
    // that this case fired unintentionally; documenting it here makes
    // the regression obvious if it returns.
    const collapsed = deriveShowCode(
      'Spring Scent Work Trial',
      'Spring Scent Work Trial',
      '2026-06-12'
    );
    expect(collapsed).toBe('SSWT.2026.SS');
  });

  it('falls back to the current year when start date is null', () => {
    const code = deriveShowCode('Club X', 'Trial Y', null);
    expect(code).toMatch(/^CX\.\d{4}\.TY$/);
  });

  it('still returns a usable code when names resolve empty (just the year)', () => {
    // When both initials resolve to empty (whitespace-only input, etc.),
    // the year is still kept — degraded but not crashed. Never returns
    // a literal "undefined" or an unbounded empty string.
    expect(deriveShowCode('', '', '2026-06-12')).toBe('2026');
    expect(deriveShowCode('', '', null)).toMatch(/^\d{4}$/);
  });
});

describe('deriveShowAbbreviation', () => {
  it('produces SS\'26 for "Spring Scent Work Trial" in 2026', () => {
    expect(deriveShowAbbreviation('Spring Scent Work Trial', '2026-06-12')).toBe("SS'26");
  });

  it('returns null when show name resolves to no initials', () => {
    expect(deriveShowAbbreviation('', '2026-06-12')).toBeNull();
  });
});

describe('deriveMagazineEditionLabel', () => {
  it('returns "Spring YYYY" for March–May start dates', () => {
    expect(deriveMagazineEditionLabel('2026-04-15')).toBe('Spring 2026');
  });

  it('returns "Summer YYYY" for June–August start dates', () => {
    expect(deriveMagazineEditionLabel('2026-07-04')).toBe('Summer 2026');
  });

  it('returns "Autumn YYYY" for September–October', () => {
    expect(deriveMagazineEditionLabel('2026-10-01')).toBe('Autumn 2026');
  });

  it('returns "Winter YYYY" for November–February', () => {
    expect(deriveMagazineEditionLabel('2026-01-15')).toBe('Winter 2026');
    expect(deriveMagazineEditionLabel('2026-12-20')).toBe('Winter 2026');
  });

  it('falls back to the current date when start is null', () => {
    expect(deriveMagazineEditionLabel(null)).toMatch(/^(Winter|Spring|Summer|Autumn) \d{4}$/);
  });
});

describe('deriveGazetteEditionLabel', () => {
  it('returns null until a real edition source ships', () => {
    expect(deriveGazetteEditionLabel()).toBeNull();
  });
});
