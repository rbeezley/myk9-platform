import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { useReportData } from '../useReportData';

vi.mock('@/services/database/trials', () => ({
  getTrialsByShow: vi.fn(),
}));

vi.mock('@/services/database/classes', () => ({
  getClassesByTrialId: vi.fn(),
}));

vi.mock('@/services/database/entries', () => ({
  getEntriesByClass: vi.fn(),
  getEntriesByShow: vi.fn(),
}));

vi.mock('@/services/database/dogs/reads', () => ({
  loadDogRegistrations: vi.fn(),
}));

import { getTrialsByShow } from '@/services/database/trials';
import { getClassesByTrialId } from '@/services/database/classes';
import { getEntriesByClass, getEntriesByShow } from '@/services/database/entries';
import { loadDogRegistrations } from '@/services/database/dogs/reads';

const mockGetTrialsByShow = vi.mocked(getTrialsByShow);
const mockGetClassesByTrialId = vi.mocked(getClassesByTrialId);
const mockGetEntriesByClass = vi.mocked(getEntriesByClass);
const mockGetEntriesByShow = vi.mocked(getEntriesByShow);
const mockLoadDogRegistrations = vi.mocked(loadDogRegistrations);

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

const mockShow = { id: 'show-1', name: 'Spring Trial 2026' } as never;

const defaultOptions = {
  show: mockShow,
  trialId: 'all' as const,
  classId: 'all' as const,
};

describe('useReportData', () => {
  beforeEach(() => {
    // resetAllMocks, not clearAllMocks: clear wipes call history but LEAVES
    // implementations, so a mockResolvedValue set by one test leaks into
    // whichever test CI's --sequence.shuffle runs next.
    vi.resetAllMocks();
    mockLoadDogRegistrations.mockResolvedValue({
      byDog: new Map(),
      serverError: null,
      registrationsReadComplete: true,
    });
  });

  it('returns null show when show is null', () => {
    const { result } = renderHook(() => useReportData({ ...defaultOptions, show: null }), {
      wrapper: createWrapper(),
    });
    expect(result.current.show).toBeNull();
    expect(mockGetTrialsByShow).not.toHaveBeenCalled();
  });

  it('passes show through from props', () => {
    mockGetTrialsByShow.mockResolvedValue({ data: [], error: null } as never);
    const { result } = renderHook(() => useReportData(defaultOptions), {
      wrapper: createWrapper(),
    });
    expect(result.current.show).toEqual(mockShow);
  });

  it('fetches trials when show is provided', async () => {
    const mockTrials = [
      { id: 'trial-1', show_id: 'show-1', date: '2026-04-12' },
      { id: 'trial-2', show_id: 'show-1', date: '2026-04-13' },
    ];
    mockGetTrialsByShow.mockResolvedValue({ data: mockTrials, error: null } as never);
    mockGetClassesByTrialId.mockResolvedValue({ data: [], error: null } as never);
    mockGetEntriesByShow.mockResolvedValue({ data: [], error: null } as never);

    const { result } = renderHook(() => useReportData(defaultOptions), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.trials).toEqual(mockTrials));
    expect(mockGetTrialsByShow).toHaveBeenCalledWith('show-1');
  });

  it('fetches classes for all trials when trialId is "all"', async () => {
    const mockTrials = [
      { id: 'trial-1', show_id: 'show-1', date: '2026-04-12' },
      { id: 'trial-2', show_id: 'show-1', date: '2026-04-13' },
    ];
    const mockClasses = [{ id: 'class-1', trial_id: 'trial-1', element: 'Buried' }];
    mockGetTrialsByShow.mockResolvedValue({ data: mockTrials, error: null } as never);
    mockGetClassesByTrialId.mockResolvedValue({ data: mockClasses, error: null } as never);
    mockGetEntriesByShow.mockResolvedValue({ data: [], error: null } as never);

    const { result } = renderHook(() => useReportData(defaultOptions), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.classes).toBeDefined());
    expect(mockGetClassesByTrialId).toHaveBeenCalledWith('trial-1');
    expect(mockGetClassesByTrialId).toHaveBeenCalledWith('trial-2');
  });

  it('fails the whole-show query when any trial class fetch fails', async () => {
    const mockTrials = [
      { id: 'trial-1', show_id: 'show-1', date: '2026-04-12' },
      { id: 'trial-2', show_id: 'show-1', date: '2026-04-13' },
    ];
    mockGetTrialsByShow.mockResolvedValue({ data: mockTrials, error: null } as never);
    mockGetClassesByTrialId.mockImplementation(async trialId =>
      trialId === 'trial-1'
        ? ({ data: [{ id: 'class-1', trial_id: trialId }], error: null } as never)
        : ({ data: null, error: new Error('class replica unavailable') } as never)
    );

    const { result } = renderHook(() => useReportData(defaultOptions), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.classes).toBeUndefined();
    expect(mockGetEntriesByShow).not.toHaveBeenCalled();
  });

  it('fetches entries by class when classId is specific', async () => {
    const mockTrials = [{ id: 'trial-1', show_id: 'show-1', date: '2026-04-12' }];
    const mockClasses = [{ id: 'class-1', trial_id: 'trial-1', element: 'Buried' }];
    const mockEntries = [{ id: 'entry-1', class_id: 'class-1' }];
    mockGetTrialsByShow.mockResolvedValue({ data: mockTrials, error: null } as never);
    mockGetClassesByTrialId.mockResolvedValue({ data: mockClasses, error: null } as never);
    mockGetEntriesByClass.mockResolvedValue({ data: mockEntries, error: null } as never);

    const { result } = renderHook(
      () => useReportData({ ...defaultOptions, trialId: 'trial-1', classId: 'class-1' }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.entries).toEqual(mockEntries));
    expect(mockGetEntriesByClass).toHaveBeenCalledWith('class-1');
    expect(mockGetEntriesByShow).not.toHaveBeenCalled();
  });

  it('fetches entries by show when classId is "all"', async () => {
    const mockTrials = [{ id: 'trial-1', show_id: 'show-1', date: '2026-04-12' }];
    const mockEntries = [{ id: 'entry-1' }, { id: 'entry-2' }];
    mockGetTrialsByShow.mockResolvedValue({ data: mockTrials, error: null } as never);
    mockGetClassesByTrialId.mockResolvedValue({ data: [], error: null } as never);
    mockGetEntriesByShow.mockResolvedValue({ data: mockEntries, error: null } as never);

    const { result } = renderHook(() => useReportData(defaultOptions), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.entries).toEqual(mockEntries));
    expect(mockGetEntriesByShow).toHaveBeenCalledWith('show-1');
  });

  it('hydrates report dogs with their registration rows', async () => {
    const mockTrials = [{ id: 'trial-1', show_id: 'show-1', date: '2026-04-12' }];
    const mockEntries = [
      {
        id: 'entry-1',
        dog_id: 'dog-1',
        dog: { id: 'dog-1', call_name: 'Rocket' },
      },
    ];
    const registration = {
      id: 'registration-1',
      dog_id: 'dog-1',
      organization: 'AKC',
      registration_number: 'DN12345678',
    };
    mockGetTrialsByShow.mockResolvedValue({ data: mockTrials, error: null } as never);
    mockGetClassesByTrialId.mockResolvedValue({ data: [], error: null } as never);
    mockGetEntriesByShow.mockResolvedValue({ data: mockEntries, error: null } as never);
    mockLoadDogRegistrations.mockResolvedValue({
      byDog: new Map([['dog-1', [registration]]]),
      serverError: null,
      registrationsReadComplete: true,
    });

    const { result } = renderHook(() => useReportData(defaultOptions), {
      wrapper: createWrapper(),
    });

    await waitFor(() =>
      expect(
        (result.current.entries?.[0] as unknown as { dog: { registrations: unknown[] } }).dog
          .registrations
      ).toEqual([registration])
    );
    expect(mockLoadDogRegistrations).toHaveBeenCalledWith(['dog-1']);
  });

  it('attaches verified registrations when the entry dog relation is absent', async () => {
    const registration = {
      id: 'registration-1',
      dog_id: 'dog-1',
      organization: 'AKC',
      registration_number: 'DN12345678',
    };
    mockGetTrialsByShow.mockResolvedValue({
      data: [{ id: 'trial-1', show_id: 'show-1' }],
      error: null,
    } as never);
    mockGetClassesByTrialId.mockResolvedValue({ data: [], error: null } as never);
    mockGetEntriesByShow.mockResolvedValue({
      data: [{ id: 'entry-1', dog_id: 'dog-1', dog: null }],
      error: null,
    } as never);
    mockLoadDogRegistrations.mockResolvedValue({
      byDog: new Map([['dog-1', [registration]]]),
      serverError: null,
      registrationsReadComplete: true,
    });

    const { result } = renderHook(() => useReportData(defaultOptions), {
      wrapper: createWrapper(),
    });

    await waitFor(() =>
      expect(result.current.entries?.[0]?.dog).toEqual({
        id: 'dog-1',
        registrations: [registration],
      })
    );
  });

  it('does not mark a report ready when registration hydration is incomplete', async () => {
    mockGetTrialsByShow.mockResolvedValue({
      data: [{ id: 'trial-1', show_id: 'show-1' }],
      error: null,
    } as never);
    mockGetClassesByTrialId.mockResolvedValue({ data: [], error: null } as never);
    mockGetEntriesByShow.mockResolvedValue({
      data: [{ id: 'entry-1', dog_id: 'dog-1', dog: { id: 'dog-1' } }],
      error: null,
    } as never);
    mockLoadDogRegistrations.mockResolvedValue({
      byDog: new Map(),
      serverError: new Error('offline'),
      registrationsReadComplete: false,
    });

    const { result } = renderHook(() => useReportData(defaultOptions), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.dataState).toBe('error'));
    expect(result.current.isReady).toBe(false);
    expect(result.current.entries).toBeUndefined();
  });

  describe('dataState', () => {
    // Restored in afterEach: onlineManager is a module-level singleton, so
    // leaving it offline would fail unrelated suites under CI's shuffle.
    afterEach(() => {
      onlineManager.setOnline(true);
    });

    const onlineWrapper = () => {
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false, networkMode: 'online', refetchOnWindowFocus: false },
        },
      });
      return ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client: queryClient }, children);
    };

    it('reports "unavailable", not "loading" and not an empty result, when offline', async () => {
      // The defect this guards: with networkMode 'online' a query with no
      // connectivity settles at isPending && !isFetching, so isLoading is
      // FALSE and isError is FALSE while data stays undefined. Every caller
      // that spelled `entries ?? []` then read that as "this class has no
      // dogs" and printed it.
      onlineManager.setOnline(false);
      mockGetTrialsByShow.mockResolvedValue({ data: [], error: null } as never);

      const { result } = renderHook(() => useReportData(defaultOptions), {
        wrapper: onlineWrapper(),
      });

      await waitFor(() => expect(result.current.dataState).toBe('unavailable'));
      expect(result.current.isReady).toBe(false);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isError).toBe(false);
      expect(result.current.entries).toBeUndefined();
    });

    it('is ready only once all three reads have landed', async () => {
      mockGetTrialsByShow.mockResolvedValue({ data: [{ id: 'trial-1' }], error: null } as never);
      mockGetClassesByTrialId.mockResolvedValue({
        data: [{ id: 'class-1' }],
        error: null,
      } as never);
      mockGetEntriesByShow.mockResolvedValue({ data: [{ id: 'entry-1' }], error: null } as never);

      const { result } = renderHook(() => useReportData(defaultOptions), {
        wrapper: onlineWrapper(),
      });

      await waitFor(() => expect(result.current.dataState).toBe('ready'));
      expect(result.current.isReady).toBe(true);
    });

    it('stays ready when connectivity drops but every row is already cached', async () => {
      // The regression this guards, caught in review: the first version of this
      // enum tested `fetchStatus === 'paused'` unconditionally, so a background
      // refetch that paused on a query ALREADY HOLDING complete data reported
      // 'unavailable'. That took the preview, Print, and every download away
      // from a secretary whose venue wifi dropped mid-session -- the exact
      // situation this page most needs to survive, made worse by the fix for it.
      mockGetTrialsByShow.mockResolvedValue({ data: [{ id: 'trial-1' }], error: null } as never);
      mockGetClassesByTrialId.mockResolvedValue({
        data: [{ id: 'class-1' }],
        error: null,
      } as never);
      mockGetEntriesByShow.mockResolvedValue({ data: [{ id: 'entry-1' }], error: null } as never);

      const { result } = renderHook(() => useReportData(defaultOptions), {
        wrapper: onlineWrapper(),
      });
      await waitFor(() => expect(result.current.dataState).toBe('ready'));

      onlineManager.setOnline(false);
      act(() => {
        result.current.refetch();
      });

      // The refetches park at fetchStatus 'paused' with data still in place.
      await waitFor(() => expect(result.current.entries).toBeDefined());
      expect(result.current.dataState).toBe('ready');
      expect(result.current.isReady).toBe(true);
    });

    it('reports "error" rather than an empty report when a read fails', async () => {
      mockGetTrialsByShow.mockResolvedValue({ data: null, error: new Error('nope') } as never);

      const { result } = renderHook(() => useReportData(defaultOptions), {
        wrapper: onlineWrapper(),
      });

      await waitFor(() => expect(result.current.dataState).toBe('error'));
      expect(result.current.isReady).toBe(false);
    });
  });
});
