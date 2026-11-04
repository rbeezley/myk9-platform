import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { resolveReportReadiness } from '@/hooks/queries/reportReadiness';
import { queryKeys } from '@/lib/queryClient';

vi.mock('../judgesOnDays', () => ({
  useJudgesOnDays: () => ({
    byTrial: new Map([
      ['t1', []],
      ['t2', []],
    ]),
    hasData: true,
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock('../useLunchOrders', () => ({
  useVolunteersOnDays: () => ({
    data: [],
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock('@/hooks/queries/useShowOfficials', () => ({
  useShowOfficials: () => ({
    data: { secretaries: [], stewards: [], chairmen: [] },
    isError: false,
    refetch: vi.fn(),
    isFetching: false,
  }),
}));
vi.mock('../lunchOrdersService', () => ({ lunchOrdersService: { listForTrial: vi.fn() } }));

import { lunchOrdersService } from '../lunchOrdersService';
import { useHospitalityPlan } from '../useHospitalityPlan';

const trials = [
  { id: 't1', date: '2026-11-07' },
  { id: 't2', date: '2026-11-07' },
  { id: 't3', date: '2026-11-08' },
];

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...renderHook(() => useHospitalityPlan('show-1', trials, true), { wrapper }) };
}

describe('useHospitalityPlan', () => {
  it('makes one day per calendar date', async () => {
    vi.mocked(lunchOrdersService.listForTrial).mockResolvedValue([]);
    const { result } = setup();
    await vi.waitFor(() => expect(result.current.readiness.hasData).toBe(true));

    expect(result.current.days.map(d => [d.date, d.trialIds])).toEqual([
      ['2026-11-07', ['t1', 't2']],
      ['2026-11-08', ['t3']],
    ]);
  });

  it('reports refreshing, not ready, while a lunch-order read refetches over cached rows', async () => {
    vi.mocked(lunchOrdersService.listForTrial).mockResolvedValue([]);
    const { result, client } = setup();
    await vi.waitFor(() => expect(result.current.readiness.hasData).toBe(true));
    expect(resolveReportReadiness([result.current.readiness])).toBe('ready');

    vi.mocked(lunchOrdersService.listForTrial).mockReturnValue(new Promise(() => {}));
    await act(async () => {
      void client.invalidateQueries({ queryKey: queryKeys.lunchOrders('t2') });
    });

    await vi.waitFor(() =>
      expect(resolveReportReadiness([result.current.readiness])).toBe('refreshing')
    );
  });
});
