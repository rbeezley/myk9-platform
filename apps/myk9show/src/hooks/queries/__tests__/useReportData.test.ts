import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useReportData } from '../useReportData';

vi.mock('@/services/database/queries/trialQueries', () => ({
  getTrialsByShow: vi.fn(),
}));

vi.mock('@/services/database/classes', () => ({
  getClassesByTrialId: vi.fn(),
}));

vi.mock('@/services/database/entries', () => ({
  getEntriesByClass: vi.fn(),
  getEntriesByShow: vi.fn(),
}));

import { getTrialsByShow } from '@/services/database/queries/trialQueries';
import { getClassesByTrialId } from '@/services/database/classes';
import { getEntriesByClass, getEntriesByShow } from '@/services/database/entries';

const mockGetTrialsByShow = vi.mocked(getTrialsByShow);
const mockGetClassesByTrialId = vi.mocked(getClassesByTrialId);
const mockGetEntriesByClass = vi.mocked(getEntriesByClass);
const mockGetEntriesByShow = vi.mocked(getEntriesByShow);

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
    vi.clearAllMocks();
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
});
