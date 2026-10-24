import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { createTestQueryClient } from '@/test/utils/testUtils';
import type { TrialOfficials } from '@/lib/reports/types';
import { useHostedReportData } from '../useHostedReportData';

const useTrialOfficialsMock = vi.fn();

vi.mock('@/hooks/queries/useTrialOfficials', () => ({
  useTrialOfficials: (...args: unknown[]) => useTrialOfficialsMock(...args),
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

const officials: TrialOfficials = {
  chairperson: {
    name: 'Casey Chair',
    streetAddress: null,
    city: null,
    state: null,
    zipCode: null,
    phone: null,
    email: null,
  },
  secretary: null,
};

function queryResult(overrides: Record<string, unknown>) {
  return {
    data: undefined,
    isError: false,
    isPlaceholderData: false,
    fetchStatus: 'idle',
    refetch: vi.fn(),
    ...overrides,
  };
}

function run(reportType: string, trialId: string | undefined) {
  const queryClient = createTestQueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return renderHook(() => useHostedReportData({ reportType, showId: 'show-1', trialId }), {
    wrapper,
  });
}

describe('useHostedReportData officials (MYK9-1386)', () => {
  beforeEach(() => {
    useTrialOfficialsMock.mockReset();
  });

  it('returns the officials for the chair report with a trial selected, once settled', () => {
    useTrialOfficialsMock.mockReturnValue(queryResult({ data: officials }));
    const { result } = run('trial-chairman-report', 'trial-1');

    expect(useTrialOfficialsMock).toHaveBeenCalledWith('show-1', true);
    expect(result.current.officials).toBe(officials);
    expect(result.current.hostedState).toBe('ready');
  });

  it('is loading while the read is in flight, then ready', () => {
    useTrialOfficialsMock.mockReturnValue(queryResult({ fetchStatus: 'fetching' }));
    const { result, rerender } = run('trial-secretary-report', 'trial-1');
    expect(result.current.hostedState).toBe('loading');
    expect(result.current.officials).toBeUndefined();

    useTrialOfficialsMock.mockReturnValue(queryResult({ data: officials }));
    rerender();
    expect(result.current.hostedState).toBe('ready');
    expect(result.current.officials).toBe(officials);
  });

  it.each([
    ['an error', { isError: true }],
    ['a paused (offline) read', { fetchStatus: 'paused' }],
  ])('counts %s as settled, with no officials', (_label, overrides) => {
    useTrialOfficialsMock.mockReturnValue(queryResult(overrides));
    const { result } = run('trial-chairman-report', 'trial-1');

    expect(result.current.hostedState).toBe('ready');
    expect(result.current.officials).toBeUndefined();
  });

  it("does not read or return officials for 'all' trials", () => {
    useTrialOfficialsMock.mockReturnValue(queryResult({ data: officials }));
    const { result } = run('trial-chairman-report', undefined);

    expect(useTrialOfficialsMock).toHaveBeenCalledWith('show-1', false);
    expect(result.current.officials).toBeUndefined();
    expect(result.current.hostedState).toBe('ready');
  });

  it('does not read or return officials for a report that does not print them', () => {
    useTrialOfficialsMock.mockReturnValue(queryResult({ data: officials }));
    const { result } = run('results-sheet', 'trial-1');

    expect(useTrialOfficialsMock).toHaveBeenCalledWith('show-1', false);
    expect(result.current.officials).toBeUndefined();
  });
});
