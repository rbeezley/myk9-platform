import {
  ALL_PAYMENT_YEARS,
  canFilterPaymentYears,
  filterPaymentRowsByYear,
  isPaymentYearSelection,
  listPaymentYears,
  paymentYearQueryRange,
  paymentRowYear,
} from './paymentYearFilter';

describe('paymentYearQueryRange', () => {
  it('builds concrete America/Chicago UTC instants matching rendered New Year boundaries', () => {
    const originalTimezone = process.env.TZ;
    process.env.TZ = 'America/Chicago';

    try {
      expect(paymentYearQueryRange('2026')).toEqual({
        start: '2026-01-01T06:00:00.000Z',
        end: '2027-01-01T06:00:00.000Z',
      });
      expect(paymentRowYear({ date: '2026-01-01T05:59:59.999Z' })).toBe('2025');
      expect(paymentRowYear({ date: '2026-01-01T06:00:00.000Z' })).toBe('2026');
      expect(paymentRowYear({ date: '2027-01-01T05:59:59.999Z' })).toBe('2026');
      expect(paymentRowYear({ date: '2027-01-01T06:00:00.000Z' })).toBe('2027');
    } finally {
      process.env.TZ = originalTimezone;
    }
  });

  it('rejects untrusted non-calendar-year URL values', () => {
    expect(paymentYearQueryRange('all')).toBeNull();
    expect(paymentYearQueryRange('26')).toBeNull();
    expect(paymentYearQueryRange('2026-or-true')).toBeNull();
  });
});

describe('paymentRowYear', () => {
  it('reads the local calendar year, matching the date the row displays', () => {
    // formatPaymentDate renders via toLocaleDateString, so the filter has to
    // agree with local time or a New Year's Eve charge files under a year the
    // row does not print.
    const iso = '2026-01-01T02:00:00Z';
    const expected = String(new Date(iso).getFullYear());
    expect(paymentRowYear({ date: iso })).toBe(expected);
  });

  it('returns null for a missing or unparseable date', () => {
    expect(paymentRowYear({ date: null })).toBeNull();
    expect(paymentRowYear({ date: 'not-a-date' })).toBeNull();
  });
});

describe('listPaymentYears', () => {
  it('lists each distinct year once, newest first', () => {
    expect(
      listPaymentYears([
        { date: '2024-06-01T12:00:00Z' },
        { date: '2026-03-01T12:00:00Z' },
        { date: '2024-09-01T12:00:00Z' },
        { date: '2025-01-15T12:00:00Z' },
      ])
    ).toEqual(['2026', '2025', '2024']);
  });

  it('contributes no year for undated rows', () => {
    expect(listPaymentYears([{ date: null }, { date: 'garbage' }])).toEqual([]);
  });

  it('returns [] for no rows', () => {
    expect(listPaymentYears([])).toEqual([]);
  });
});

describe('isPaymentYearSelection', () => {
  const years = ['2026', '2025'];

  it('accepts a year the exhibitor actually has, and "all"', () => {
    expect(isPaymentYearSelection('2025', years)).toBe(true);
    expect(isPaymentYearSelection(ALL_PAYMENT_YEARS, years)).toBe(true);
  });

  it('rejects a stale, absent, or empty year so the caller can fall back', () => {
    expect(isPaymentYearSelection('2019', years)).toBe(false);
    expect(isPaymentYearSelection(null, years)).toBe(false);
    expect(isPaymentYearSelection('', years)).toBe(false);
  });
});

describe('canFilterPaymentYears', () => {
  it('is false for a single season, so no inert control is rendered', () => {
    expect(
      canFilterPaymentYears([{ date: '2026-03-01T12:00:00Z' }, { date: '2026-09-01T12:00:00Z' }])
    ).toBe(false);
  });

  it('is false with no rows at all', () => {
    expect(canFilterPaymentYears([])).toBe(false);
  });

  it('is true across two seasons', () => {
    expect(
      canFilterPaymentYears([{ date: '2026-03-01T12:00:00Z' }, { date: '2025-03-01T12:00:00Z' }])
    ).toBe(true);
  });

  it('is true for one season plus undated rows — only All time shows those', () => {
    // Otherwise arriving on a valid ?year= link hides the undated rows with no
    // control left to get back to them.
    expect(canFilterPaymentYears([{ date: '2026-03-01T12:00:00Z' }, { date: null }])).toBe(true);
  });
});

describe('filterPaymentRowsByYear', () => {
  const rows = [
    { id: 'a', date: '2026-03-01T12:00:00Z' },
    { id: 'b', date: '2025-07-04T12:00:00Z' },
    { id: 'c', date: null },
  ];

  it('keeps only the selected year', () => {
    expect(filterPaymentRowsByYear(rows, '2025').map(r => r.id)).toEqual(['b']);
  });

  it('returns every row, undated included, for all time', () => {
    expect(filterPaymentRowsByYear(rows, ALL_PAYMENT_YEARS).map(r => r.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('drops undated rows from a year view rather than guessing a year for them', () => {
    expect(filterPaymentRowsByYear(rows, '2026').map(r => r.id)).toEqual(['a']);
  });

  it('keeps a refund in the year it was issued, not the year of the charge', () => {
    // Cash basis: netting a 2026 refund back into 2025 would restate a year
    // the exhibitor may already have filed.
    const ledger = [
      { id: 'charge', date: '2025-12-20T12:00:00Z' },
      { id: 'refund', date: '2026-01-08T12:00:00Z' },
    ];
    expect(filterPaymentRowsByYear(ledger, '2025').map(r => r.id)).toEqual(['charge']);
    expect(filterPaymentRowsByYear(ledger, '2026').map(r => r.id)).toEqual(['refund']);
  });
});
