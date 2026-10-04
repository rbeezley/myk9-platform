import { describe, expect, it } from 'vitest';
import {
  catalogPlacement,
  countCatalogClass,
  formatCatalogDate,
  formatOwnerAddress,
  handlerDiffersFromOwner,
  resolveCatalogResult,
} from '../catalogFields';
import type { ReportEntry } from '../types';

function entry(overrides: Partial<ReportEntry>): ReportEntry {
  return {
    id: 'e',
    armband: '1',
    runOrder: null,
    callName: 'Dog',
    breed: '',
    handler: '',
    registrationNumber: null,
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

describe('resolveCatalogResult', () => {
  it('prints WD for a withdrawal with no recorded reason code, never a guessed reason', () => {
    expect(resolveCatalogResult(entry({ entryStatus: 'withdrawn' }))).toBe('WD');
  });

  it('lets a withdrawal win over a stale result', () => {
    expect(
      resolveCatalogResult(
        entry({ entryStatus: 'withdrawn', withdrawalReasonCode: 'judge_change', resultText: 'nq' })
      )
    ).toBe('AJC');
  });

  it('prints DQ only for a stored DQ marker, otherwise EXC', () => {
    expect(resolveCatalogResult(entry({ resultText: 'excused' }))).toBe('EXC');
    expect(resolveCatalogResult(entry({ resultText: 'excused', finalPlacement: 10000 }))).toBe(
      'DQ'
    );
  });

  // Replication hands placements over as strings (Codex P2 on #MYK9-1009).
  it('reads the DQ placement marker when it arrives as a string', () => {
    const dq = entry({
      resultText: 'excused',
      finalPlacement: '10000' as unknown as number,
    });
    expect(resolveCatalogResult(dq)).toBe('DQ');
  });

  // The scoring editor records a withdrawal as a result, leaving entry_status alone.
  it('prints a withdrawal recorded as a result', () => {
    expect(resolveCatalogResult(entry({ entryStatus: 'confirmed', resultText: 'withdrawn' }))).toBe(
      'WD'
    );
  });

  it('prints nothing for a dog that has not been scored', () => {
    expect(resolveCatalogResult(entry({ resultText: 'pending' }))).toBe('');
  });
});

describe('countCatalogClass', () => {
  it('does not count a pull as a withdrawal, and keeps it in entries', () => {
    const counts = countCatalogClass([
      entry({ id: 'a', entryStatus: 'scratched' }),
      entry({ id: 'b', resultText: 'q' }),
    ]);
    expect(counts).toEqual({ entries: 2, competing: 1, qualifying: 1, withdrawn: 0 });
  });

  it('treats a dog pulled at check-in as entered but not competing', () => {
    expect(countCatalogClass([entry({ checkInStatus: 'pulled' })])).toMatchObject({
      entries: 1,
      competing: 0,
    });
  });

  it('counts a withdrawal recorded as a result as withdrawn, not competing', () => {
    expect(
      countCatalogClass([
        entry({ id: 'a', entryStatus: 'confirmed', resultText: 'withdrawn' }),
        entry({ id: 'b', entryStatus: 'confirmed', resultText: 'qualified' }),
      ])
    ).toEqual({ entries: 1, competing: 1, qualifying: 1, withdrawn: 1 });
  });

  it('counts an absence recorded as a result as not competing', () => {
    expect(countCatalogClass([entry({ resultText: 'absent' })])).toMatchObject({
      entries: 1,
      competing: 0,
    });
  });
});

describe('field formatting', () => {
  it('joins only the address parts that exist', () => {
    expect(formatOwnerAddress({ city: 'Austin', state: 'TX' })).toBe('Austin, TX');
    expect(formatOwnerAddress({ street_address: '1 A St', zip_code: '78701' })).toBe(
      '1 A St, 78701'
    );
    expect(formatOwnerAddress(null)).toBe('');
  });

  it('formats an ISO date and blanks a malformed one', () => {
    expect(formatCatalogDate('2020-03-05')).toBe('3/5/2020');
    expect(formatCatalogDate('March')).toBe('');
    expect(formatCatalogDate(null)).toBe('');
  });

  it('prints only placements 1 to 4', () => {
    expect(catalogPlacement(entry({ finalPlacement: 4 }))).toBe('4');
    expect(catalogPlacement(entry({ finalPlacement: 5 }))).toBe('');
    expect(catalogPlacement(entry({ finalPlacement: 9996 }))).toBe('');
  });

  it('does not call an unnamed handler different', () => {
    expect(handlerDiffersFromOwner({ handlerName: null, source: 'unknown', owner: null })).toBe(
      false
    );
    expect(
      handlerDiffersFromOwner({
        handlerName: 'Sam Lee',
        source: 'assigned-text',
        owner: { first_name: 'Sam', last_name: 'Lee' },
      })
    ).toBe(false);
  });
});
