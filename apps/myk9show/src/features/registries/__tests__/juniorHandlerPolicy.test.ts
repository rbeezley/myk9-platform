/**
 * MYK9-570 slice 1. Junior status is a RULEBOOK fact measured at a boundary, and the
 * three registries disagree about which day the boundary falls on — so every case here
 * is a date one day either side of a threshold. Getting one of these wrong prints "Jr."
 * on an adult's catalog line or hides a junior from the registry's paperwork.
 */
import { describe, it, expect } from 'vitest';
import {
  deriveJuniorStatus,
  getJuniorHandlerNumber,
  getJuniorHandlerRule,
  registriesIssuingJuniorHandlerNumbers,
} from '../juniorHandlerPolicy';

describe('AKC — less than 18 on the DAY OF THE TRIAL', () => {
  const dateOfBirth = '2008-09-18';

  it('is junior the day before the 18th birthday', () => {
    expect(
      deriveJuniorStatus({ dateOfBirth, trialDate: '2026-09-17', registryId: 'AKC' })
    ).toMatchObject({ kind: 'junior', ageOnTrialDate: 17 });
  });

  it('is an adult ON the 18th birthday — "less than 18", not "18 or under"', () => {
    expect(
      deriveJuniorStatus({ dateOfBirth, trialDate: '2026-09-18', registryId: 'AKC' })
    ).toMatchObject({ kind: 'adult', ageOnTrialDate: 18 });
  });

  it('is an adult the day after', () => {
    expect(
      deriveJuniorStatus({ dateOfBirth, trialDate: '2026-09-19', registryId: 'AKC' })
    ).toMatchObject({ kind: 'adult', ageOnTrialDate: 18 });
  });

  it('measures on the trial date, not today — a reprint of a 2019 trial says junior', () => {
    expect(
      deriveJuniorStatus({ dateOfBirth, trialDate: '2019-05-04', registryId: 'AKC' })
    ).toMatchObject({ kind: 'junior', ageOnTrialDate: 10 });
  });

  it('cites the rulebook', () => {
    const status = deriveJuniorStatus({ dateOfBirth, trialDate: '2026-09-17', registryId: 'AKC' });
    expect(status.ruleSource).toContain('AKC Scent Work Regulations');
    expect(status.ruleSource).toContain('day of the trial');
  });
});

describe('UKC — not yet 18 as of JANUARY 1 of the competition year', () => {
  const dateOfBirth = '2008-09-18';

  it('stays junior at a November trial in the year the handler turns 18', () => {
    // 18 on the day of the trial, but 17 on January 1 — UKC keeps them a junior all year.
    expect(
      deriveJuniorStatus({ dateOfBirth, trialDate: '2026-11-07', registryId: 'UKC' })
    ).toMatchObject({ kind: 'junior', ageOnTrialDate: 17 });
  });

  it('differs from AKC on the same handler and the same trial', () => {
    const input = { dateOfBirth, trialDate: '2026-11-07' } as const;
    expect(deriveJuniorStatus({ ...input, registryId: 'UKC' }).kind).toBe('junior');
    expect(deriveJuniorStatus({ ...input, registryId: 'AKC' }).kind).toBe('adult');
  });

  it('is an adult for the whole of the year AFTER they turned 18', () => {
    expect(
      deriveJuniorStatus({ dateOfBirth, trialDate: '2027-01-02', registryId: 'UKC' })
    ).toMatchObject({ kind: 'adult', ageOnTrialDate: 18 });
  });

  it('a January 1 birthday is 18 ON January 1 and therefore already an adult', () => {
    expect(
      deriveJuniorStatus({ dateOfBirth: '2008-01-01', trialDate: '2026-06-01', registryId: 'UKC' })
    ).toMatchObject({ kind: 'adult', ageOnTrialDate: 18 });
  });

  it('a January 2 birthday is still 17 on January 1 and junior all year', () => {
    expect(
      deriveJuniorStatus({ dateOfBirth: '2008-01-02', trialDate: '2026-12-31', registryId: 'UKC' })
    ).toMatchObject({ kind: 'junior', ageOnTrialDate: 17 });
  });
});

describe('ASCA — a floor of 8 and NO ceiling, so junior status is not derivable', () => {
  it('returns unknown rather than inventing an upper bound', () => {
    const status = deriveJuniorStatus({
      dateOfBirth: '2012-09-18',
      trialDate: '2026-09-18',
      registryId: 'ASCA',
    });
    expect(status.kind).toBe('unknown');
    expect(status.ageOnTrialDate).toBe(14);
    expect(status.ruleSource).toContain('no upper age bound');
  });

  it('never returns junior for ASCA, at any age', () => {
    for (const dateOfBirth of ['2018-09-18', '2012-01-01', '1975-06-30']) {
      expect(
        deriveJuniorStatus({ dateOfBirth, trialDate: '2026-09-18', registryId: 'ASCA' }).kind
      ).not.toBe('junior');
    }
  });

  it('is ineligible the day before the 8th birthday and eligible on it', () => {
    expect(
      deriveJuniorStatus({ dateOfBirth: '2018-09-19', trialDate: '2026-09-18', registryId: 'ASCA' })
    ).toMatchObject({ kind: 'ineligible', ageOnTrialDate: 7 });
    expect(
      deriveJuniorStatus({ dateOfBirth: '2018-09-18', trialDate: '2026-09-18', registryId: 'ASCA' })
    ).toMatchObject({ kind: 'unknown', ageOnTrialDate: 8 });
  });
});

describe('missing or unusable data', () => {
  it.each([null, undefined, '', '   ', 'not-a-date', '18/09/2008', '2008-02-31'])(
    'returns unknown with no age for a date of birth of %p',
    dateOfBirth => {
      const status = deriveJuniorStatus({
        dateOfBirth,
        trialDate: '2026-09-18',
        registryId: 'AKC',
      });
      expect(status.kind).toBe('unknown');
      expect(status.ageOnTrialDate).toBeUndefined();
    }
  );

  it('returns unknown, never junior, for a date of birth after the trial date', () => {
    // A negative age is below every registry's ceiling, so an unguarded typo would
    // print "Jr." on an adult's catalog line. It must read as bad data.
    for (const registryId of ['AKC', 'UKC'] as const) {
      const status = deriveJuniorStatus({
        dateOfBirth: '2099-01-01',
        trialDate: '2026-09-18',
        registryId,
      });
      expect(status.kind).toBe('unknown');
      expect(status.ageOnTrialDate).toBeUndefined();
    }
  });

  it('returns unknown when the trial has no date', () => {
    const status = deriveJuniorStatus({
      dateOfBirth: '2012-09-18',
      trialDate: null,
      registryId: 'AKC',
    });
    expect(status.kind).toBe('unknown');
    expect(status.ruleSource).toContain('trial date');
  });

  it('accepts a timestamp-prefixed value only in the plain ISO form it documents', () => {
    // Guards against a caller passing `2008-09-18T00:00:00Z` and silently getting 'unknown'
    // treated as 'adult' somewhere downstream. It IS unknown, and that is the contract.
    expect(
      deriveJuniorStatus({
        dateOfBirth: '2008-09-18T00:00:00Z',
        trialDate: '2026-09-17',
        registryId: 'AKC',
      }).kind
    ).toBe('unknown');
  });
});

describe('junior handler numbers', () => {
  it('reads the number for the registry in hand', () => {
    expect(getJuniorHandlerNumber({ AKC: '1234567', UKC: 'J-99' }, 'AKC')).toBe('1234567');
    expect(getJuniorHandlerNumber({ AKC: '1234567', UKC: 'J-99' }, 'UKC')).toBe('J-99');
  });

  it('treats a missing, blank or non-string value as absent', () => {
    expect(getJuniorHandlerNumber({ AKC: '1234567' }, 'ASCA')).toBeNull();
    expect(getJuniorHandlerNumber({ AKC: '   ' }, 'AKC')).toBeNull();
    expect(getJuniorHandlerNumber({ AKC: 1234567 }, 'AKC')).toBeNull();
    expect(getJuniorHandlerNumber(null, 'AKC')).toBeNull();
    expect(getJuniorHandlerNumber(undefined, 'AKC')).toBeNull();
    expect(getJuniorHandlerNumber([], 'AKC')).toBeNull();
    expect(getJuniorHandlerNumber('AKC', 'AKC')).toBeNull();
  });

  it('trims, because a form input carries whatever the secretary typed', () => {
    expect(getJuniorHandlerNumber({ AKC: '  1234567 ' }, 'AKC')).toBe('1234567');
  });

  it('offers a number input only for the registries that have somewhere to print one', () => {
    // AKC issues an AKC Junior Handler number; UKC's change-entry form has a Junior ID
    // slot. ASCA issues neither, so the app must not ask for one.
    expect(registriesIssuingJuniorHandlerNumbers()).toEqual(['AKC', 'UKC']);
  });
});

describe('the rule table itself', () => {
  it('never states both a floor and a ceiling — no rulebook does', () => {
    for (const registryId of ['AKC', 'UKC', 'ASCA'] as const) {
      const rule = getJuniorHandlerRule(registryId);
      expect(
        rule.minAgeYearsInclusive === null || rule.maxAgeYearsExclusive === null,
        `${registryId} claims both bounds; one of them was invented`
      ).toBe(true);
      expect(rule.citation.length).toBeGreaterThan(20);
    }
  });

  it('measures UKC on January 1 and the others on the trial date', () => {
    expect(getJuniorHandlerRule('UKC').ageMeasuredOn).toBe('january-1-of-trial-year');
    expect(getJuniorHandlerRule('AKC').ageMeasuredOn).toBe('trial-date');
    expect(getJuniorHandlerRule('ASCA').ageMeasuredOn).toBe('trial-date');
  });
});
