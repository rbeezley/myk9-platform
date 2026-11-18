// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  formatRecordingFeeAmount as coreFormat,
  recordingFeeRateInForce as coreInForce,
} from '../../../packages/core/src/utils/recordingFeeRate';
import {
  buildPremiumRecordingFee,
  formatRecordingFeeAmount,
  recordingFeeRateInForce,
  recordingFeeRatesFromRows,
  type RecordingFeeRate,
} from './recordingFeeRate';

// The seeded AKC rows (migration 20261119031700), as the function reads them.
const ROWS = [
  { registry: 'AKC', effective_from: '2025-01-01', amount_cents: 350 },
  { registry: 'AKC', effective_from: '2026-01-01', amount_cents: 450 },
  { registry: 'AKC', effective_from: '2027-01-01', amount_cents: 550 },
];
const RATES = recordingFeeRatesFromRows(ROWS);

describe('premium recording fee statement (MYK9-2044)', () => {
  it('prints the 2027 rate for an AKC show dated 2027', () => {
    expect(buildPremiumRecordingFee('AKC', '2027-01-15', RATES)).toEqual({
      registry: 'AKC',
      amountCents: 550,
      text: 'AKC recording fee: $5.50 per entry',
    });
  });

  it('prints the 2026 rate for a 2026 show, including the last day of the year', () => {
    expect(buildPremiumRecordingFee('AKC', '2026-06-12', RATES)?.text).toBe(
      'AKC recording fee: $4.50 per entry'
    );
    expect(buildPremiumRecordingFee('AKC', '2026-12-31', RATES)?.text).toBe(
      'AKC recording fee: $4.50 per entry'
    );
  });

  it('prints no line when no rate is in force, the date is unusable, or the show is not AKC', () => {
    expect(buildPremiumRecordingFee('AKC', '2024-12-31', RATES)).toBeNull();
    expect(buildPremiumRecordingFee('AKC', null, RATES)).toBeNull();
    expect(buildPremiumRecordingFee('AKC', '2027-01-15', [])).toBeNull();
    expect(buildPremiumRecordingFee('UKC', '2027-01-15', RATES)).toBeNull();
    expect(buildPremiumRecordingFee(null, '2027-01-15', RATES)).toBeNull();
  });
});

describe('parity with @myk9/core (the Trial Secretary report reads the core copy)', () => {
  const EXTRA: RecordingFeeRate[] = [
    { registry: 'UKC', effectiveFrom: '2026-03-01', amountCents: 125 },
    { registry: 'AKC', effectiveFrom: '2028-07-04', amountCents: 600 },
  ];
  const all = [...RATES, ...EXTRA];
  const dates = [
    '2024-12-31',
    '2025-01-01',
    '2025-12-31',
    '2026-01-01',
    '2026-12-31',
    '2027-01-01',
    '2028-07-03',
    '2028-07-04',
    '2027-02-30',
    '2026-12-31T23:30:00-08:00',
    '',
    'not a date',
    null,
    undefined,
  ];

  it.each(dates)('picks the same rate for %s', date => {
    for (const registry of ['AKC', 'UKC', 'ASCA']) {
      expect(recordingFeeRateInForce(all, registry, date)).toEqual(
        coreInForce(all, registry, date)
      );
    }
  });

  it.each([0, 350, 450, 550, 1999])('formats %s cents the same', cents => {
    expect(formatRecordingFeeAmount(cents)).toBe(coreFormat(cents));
  });
});
