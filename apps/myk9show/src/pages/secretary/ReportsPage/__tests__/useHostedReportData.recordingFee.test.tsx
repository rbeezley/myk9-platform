import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { createTestQueryClient } from '@/test/utils/testUtils';
import { useHostedReportData } from '../useHostedReportData';

const useRecordingFeeRatesMock = vi.fn();

vi.mock('@/hooks/queries/useRecordingFeeRates', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/queries/useRecordingFeeRates')>()),
  useRecordingFeeRates: (...args: unknown[]) => useRecordingFeeRatesMock(...args),
}));
vi.mock('@/hooks/queries/useTrialOfficials', () => ({
  useTrialOfficials: () => ({
    data: { chairperson: null, secretary: null },
    isError: false,
    fetchStatus: 'idle',
  }),
}));
vi.mock('@/hooks/queries/useEntryFormData', () => ({
  useEntryFormData: () => ({ readiness: {}, dogs: [], trials: [] }),
}));
vi.mock('../useWaitlistReportQuery', () => ({
  useWaitlistReportQuery: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
    isPlaceholderData: false,
    fetchStatus: 'idle',
  }),
}));

const RATES = [{ registry: 'AKC', effectiveFrom: '2027-01-01', amountCents: 550 }];

function query(overrides: Record<string, unknown>) {
  return {
    data: undefined,
    isError: false,
    isPlaceholderData: false,
    fetchStatus: 'idle',
    refetch: vi.fn(),
    ...overrides,
  };
}

function run(reportType: string, trialId: string | null = 'trial-1') {
  const client = createTestQueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(
    () => useHostedReportData({ reportType, showId: 'show-1', trialId: trialId ?? undefined }),
    {
      wrapper,
    }
  );
}

describe('useHostedReportData recording fee rates (MYK9-2044)', () => {
  beforeEach(() => {
    useRecordingFeeRatesMock.mockReset();
  });

  it('holds the Trial Secretary Report until the rate list is read, then hands it over', () => {
    useRecordingFeeRatesMock.mockReturnValue(query({ fetchStatus: 'fetching' }));
    const { result, rerender } = run('trial-secretary-report');
    expect(useRecordingFeeRatesMock).toHaveBeenCalledWith(true);
    expect(result.current.hostedState).toBe('loading');

    useRecordingFeeRatesMock.mockReturnValue(query({ data: RATES }));
    rerender();
    expect(result.current.hostedState).toBe('ready');
    expect(result.current.recordingFeeRates).toEqual({
      data: RATES,
      isLoading: false,
      isError: false,
    });
  });

  it.each([
    ['a failed read', { isError: true }],
    ['a paused (offline) read with nothing cached', { fetchStatus: 'paused' }],
  ])('settles on %s and tells the report it has no list', (_label, overrides) => {
    useRecordingFeeRatesMock.mockReturnValue(query(overrides));
    const { result } = run('trial-secretary-report');

    expect(result.current.hostedState).toBe('ready');
    expect(result.current.recordingFeeRates).toMatchObject({ isError: true, isLoading: false });
  });

  it('reads no rates for a report that does not price runs, or with no trial chosen', () => {
    useRecordingFeeRatesMock.mockReturnValue(query({ data: RATES }));

    expect(run('trial-chairman-report').result.current.recordingFeeRates).toBeUndefined();
    expect(useRecordingFeeRatesMock).toHaveBeenLastCalledWith(false);
    expect(run('trial-secretary-report', null).result.current.recordingFeeRates).toBeUndefined();
    expect(useRecordingFeeRatesMock).toHaveBeenLastCalledWith(false);
  });
});
