import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { UseQueryResult } from '@tanstack/react-query';
import type { RecordingFeeRate } from '@myk9/core';

const select = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ select }) },
}));

import {
  fetchRecordingFeeRates,
  recordingFeeRatesForReport,
  recordingFeeRatesSettled,
} from './useRecordingFeeRates';

const asQuery = (partial: Partial<UseQueryResult<RecordingFeeRate[]>>) =>
  partial as UseQueryResult<RecordingFeeRate[]>;

beforeEach(() => {
  select.mockReset();
  window.localStorage.clear();
});

describe('fetchRecordingFeeRates', () => {
  it('maps the rows to camelCase rates and keeps a copy for the next offline start', async () => {
    select.mockResolvedValueOnce({
      data: [{ registry: 'AKC', effective_from: '2027-01-01', amount_cents: 550 }],
      error: null,
    });

    const rates = await fetchRecordingFeeRates();

    expect(select).toHaveBeenCalledWith('registry, effective_from, amount_cents');
    expect(rates).toEqual([{ registry: 'AKC', effectiveFrom: '2027-01-01', amountCents: 550 }]);
    expect(
      JSON.parse(window.localStorage.getItem('myk9:registry-recording-fee-rates:v1')!)
    ).toEqual(rates);
  });

  it('throws on a read error instead of caching it as an empty list', async () => {
    select.mockResolvedValueOnce({ data: null, error: { message: 'denied' } });

    await expect(fetchRecordingFeeRates()).rejects.toThrow('denied');
    expect(window.localStorage.getItem('myk9:registry-recording-fee-rates:v1')).toBeNull();
  });
});

describe('recordingFeeRatesForReport', () => {
  const rates: RecordingFeeRate[] = [
    { registry: 'AKC', effectiveFrom: '2027-01-01', amountCents: 550 },
  ];

  it('hands a read list over, empty or not, as read', () => {
    expect(recordingFeeRatesForReport(asQuery({ data: rates }))).toEqual({
      data: rates,
      isLoading: false,
      isError: false,
    });
    expect(recordingFeeRatesForReport(asQuery({ data: [] })).isError).toBe(false);
  });

  it('reports a failed or offline read with no list as an error, never as an empty list', () => {
    expect(
      recordingFeeRatesForReport(asQuery({ data: undefined, isError: true, fetchStatus: 'idle' }))
    ).toMatchObject({ isError: true, isLoading: false });
    expect(
      recordingFeeRatesForReport(
        asQuery({ data: undefined, isError: false, fetchStatus: 'paused' })
      )
    ).toMatchObject({ isError: true, isLoading: false });
  });

  it('reports an in-flight first read as loading', () => {
    expect(
      recordingFeeRatesForReport(
        asQuery({ data: undefined, isError: false, fetchStatus: 'fetching' })
      )
    ).toMatchObject({ isLoading: true, isError: false });
    expect(
      recordingFeeRatesSettled(
        asQuery({ data: undefined, isError: false, fetchStatus: 'fetching' })
      )
    ).toBe(false);
  });
});
