import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { UseQueryResult } from '@tanstack/react-query';
import type { RecordingFeeRate } from '@myk9/core';

const select = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ select }) },
}));

import {
  readCachedRecordingFeeRates,
  recordingFeeRatesLive,
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

describe('cached list on the device', () => {
  const store = (value: unknown) =>
    window.localStorage.setItem('myk9:registry-recording-fee-rates:v1', JSON.stringify(value));

  it('keeps real rows and drops any row that is not a dated, positive rate', () => {
    store([
      { registry: 'AKC', effectiveFrom: '2027-01-01', amountCents: 550 },
      { registry: 'AKC', effectiveFrom: '2027-02-30', amountCents: 550 },
      { registry: 'AKC', effectiveFrom: 'January', amountCents: 550 },
      { registry: 'AKC', effectiveFrom: '2027-03-01', amountCents: 0 },
      { registry: 'AKC', effectiveFrom: '2027-03-01', amountCents: -5 },
      { registry: 'AKC', effectiveFrom: '2027-03-01', amountCents: 5.5 },
      { registry: 'AKC', effectiveFrom: '2027-03-01' },
      null,
    ]);

    expect(readCachedRecordingFeeRates()).toEqual([
      { registry: 'AKC', effectiveFrom: '2027-01-01', amountCents: 550 },
    ]);
  });

  it('is undefined for nothing stored, junk, or a non-list', () => {
    expect(readCachedRecordingFeeRates()).toBeUndefined();
    window.localStorage.setItem('myk9:registry-recording-fee-rates:v1', '{not json');
    expect(readCachedRecordingFeeRates()).toBeUndefined();
    store({ registry: 'AKC' });
    expect(readCachedRecordingFeeRates()).toBeUndefined();
  });
});

describe('recordingFeeRatesLive', () => {
  const live = (q: Record<string, unknown>) =>
    recordingFeeRatesLive(
      asQuery({
        data: [],
        dataUpdatedAt: 1,
        isFetching: false,
        isError: false,
        fetchStatus: 'idle',
        ...q,
      })
    );

  it('is true only for a list the server answered, with no refetch running', () => {
    expect(live({})).toBe(true);
    expect(live({ dataUpdatedAt: 0 })).toBe(false); // seeded from the device cache
    expect(live({ isFetching: true })).toBe(false);
    expect(live({ isError: true })).toBe(false);
    expect(live({ fetchStatus: 'paused' })).toBe(false);
    expect(live({ data: undefined })).toBe(false);
  });
});

describe('recordingFeeRatesForReport', () => {
  const rates: RecordingFeeRate[] = [
    { registry: 'AKC', effectiveFrom: '2027-01-01', amountCents: 550 },
  ];

  it('hands a read list over, empty or not, as read', () => {
    expect(recordingFeeRatesForReport(asQuery({ data: rates }), true)).toEqual({
      data: rates,
      isLoading: false,
      isError: false,
    });
    expect(recordingFeeRatesForReport(asQuery({ data: [] }), true).isError).toBe(false);
  });

  it('reports a failed or offline read with no list as an error, never as an empty list', () => {
    expect(
      recordingFeeRatesForReport(
        asQuery({ data: undefined, isError: true, fetchStatus: 'idle' }),
        true
      )
    ).toMatchObject({ isError: true, isLoading: false });
    expect(
      recordingFeeRatesForReport(
        asQuery({ data: undefined, isError: false, fetchStatus: 'paused' }),
        true
      )
    ).toMatchObject({ isError: true, isLoading: false });
  });

  it('never holds a report on a disabled query, which sits idle with no data forever', () => {
    expect(
      recordingFeeRatesForReport(
        asQuery({ data: undefined, isError: false, fetchStatus: 'idle' }),
        false
      )
    ).toEqual({ data: [], isLoading: false, isError: false });
  });

  it('reports an in-flight first read as loading', () => {
    expect(
      recordingFeeRatesForReport(
        asQuery({ data: undefined, isError: false, fetchStatus: 'fetching' }),
        true
      )
    ).toMatchObject({ isLoading: true, isError: false });
    expect(
      recordingFeeRatesSettled(
        asQuery({ data: undefined, isError: false, fetchStatus: 'fetching' })
      )
    ).toBe(false);
  });
});
