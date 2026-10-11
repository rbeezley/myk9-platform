import { describe, expect, it } from 'vitest';
import {
  catalogRows,
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
  it('prints WD for a result-recorded withdrawal with no reason code, never a guessed reason', () => {
    expect(resolveCatalogResult(entry({ resultText: 'withdrawn' }))).toBe('WD');
  });

  it('lets a withdrawal win over a stale result', () => {
    expect(
      resolveCatalogResult(
        entry({ entryStatus: 'withdrawn', withdrawalReasonCode: 'judge_change', resultText: 'nq' })
      )
    ).toBe('AJC');
  });

  // MYK9-1011: the stored result drives the code, not a legacy placement marker.
  it('prints DQ for a stored disqualified result and EXC for an excused one', () => {
    expect(resolveCatalogResult(entry({ resultText: 'disqualified' }))).toBe('DQ');
    expect(resolveCatalogResult(entry({ resultText: 'excused' }))).toBe('EXC');
    expect(
      resolveCatalogResult(entry({ resultText: 'excused', resultReason: 'Handler request' }))
    ).toBe('EXC');
    expect(
      resolveCatalogResult(entry({ resultText: 'disqualified', finalPlacement: null }))
    ).not.toBe(resolveCatalogResult(entry({ resultText: 'excused' })));
  });

  it('prints DQ for a disqualified result whatever its stale placement', () => {
    expect(resolveCatalogResult(entry({ resultText: 'disqualified', finalPlacement: 1 }))).toBe(
      'DQ'
    );
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

describe('countCatalogClass with a disqualified dog', () => {
  it('counts a DQ as competing and as not qualifying', () => {
    const counts = countCatalogClass([
      entry({ id: 'q', entryStatus: 'checked-in', resultText: 'qualified', isScored: true }),
      entry({ id: 'dq', entryStatus: 'checked-in', resultText: 'disqualified', isScored: true }),
      entry({ id: 'ex', entryStatus: 'checked-in', resultText: 'excused', isScored: true }),
    ]);
    expect(counts).toEqual({ entries: 3, competing: 3, qualifying: 1, withdrawn: 0 });
  });

  it('never prints a placement for a DQ', () => {
    expect(catalogPlacement(entry({ resultText: 'disqualified', finalPlacement: 10000 }))).toBe('');
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

  // A catalog printed mid-class must not count dogs that have not run yet.
  it('counts only dogs with a run result as competing, keeping excused dogs', () => {
    expect(
      countCatalogClass([
        entry({ id: 'a', entryStatus: 'confirmed', resultText: 'pending' }),
        entry({ id: 'b', entryStatus: 'confirmed', resultText: 'qualified' }),
        entry({ id: 'c', entryStatus: 'confirmed', resultText: 'excused' }),
      ])
    ).toEqual({ entries: 3, competing: 2, qualifying: 1, withdrawn: 0 });
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

describe('declined entries are not entries', () => {
  // rejectEntry stores entry_status 'withdrawn' with no withdrawal_reason_code.
  const declined = entry({ id: 'declined', entryStatus: 'withdrawn' });
  const inSeason = entry({
    id: 'ais',
    entryStatus: 'withdrawn',
    withdrawalReasonCode: 'in_season',
  });
  const judgeChange = entry({
    id: 'ajc',
    entryStatus: 'withdrawn',
    withdrawalReasonCode: 'judge_change',
  });
  const resultWithdrawn = entry({ id: 'wd', entryStatus: 'confirmed', resultText: 'withdrawn' });
  const ran = entry({ id: 'ran', resultText: 'q' });

  it('leaves a declined entry out of the listing', () => {
    expect(catalogRows([declined, inSeason, ran]).map(row => row.id)).toEqual(['ais', 'ran']);
  });

  it('leaves a declined entry out of every header count', () => {
    expect(countCatalogClass([declined, ran])).toEqual({
      entries: 1,
      competing: 1,
      qualifying: 1,
      withdrawn: 0,
    });
  });

  it('keeps real withdrawals listed and counted, printed as AIS and AJC', () => {
    expect(countCatalogClass([inSeason, judgeChange, ran])).toEqual({
      entries: 1,
      competing: 1,
      qualifying: 1,
      withdrawn: 2,
    });
    expect(catalogRows([inSeason, judgeChange]).map(resolveCatalogResult)).toEqual(['AIS', 'AJC']);
  });

  it('keeps a result-recorded withdrawal listed as WD and counted withdrawn', () => {
    expect(catalogRows([resultWithdrawn])).toHaveLength(1);
    expect(resolveCatalogResult(resultWithdrawn)).toBe('WD');
    expect(countCatalogClass([resultWithdrawn]).withdrawn).toBe(1);
  });
});
