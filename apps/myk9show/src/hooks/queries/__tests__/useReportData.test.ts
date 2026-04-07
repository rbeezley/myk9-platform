import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useReportData } from '../useReportData';

vi.mock('@/services/database/queries/showQueries', () => ({
  getShowById: vi.fn(),
}));

vi.mock('@/services/database/queries/trialQueries', () => ({
  getTrialsByShow: vi.fn(),
}));

vi.mock('@/services/database/queries/classQueries', () => ({
  getClassesByTrialId: vi.fn(),
}));

vi.mock('@/services/database/queries/entryQueries', () => ({
  getEntriesByClass: vi.fn(),
  getEntriesByShow: vi.fn(),
}));

import { getShowById } from '@/services/database/queries/showQueries';
import { getTrialsByShow } from '@/services/database/queries/trialQueries';
import { getClassesByTrialId } from '@/services/database/queries/classQueries';
import { getEntriesByClass, getEntriesByShow } from '@/services/database/queries/entryQueries';

const mockGetShowById = vi.mocked(getShowById);
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

const defaultOptions = {
  showId: 'show-1',
  trialId: 'all' as const,
  classId: 'all' as const,
  reportType: 'catalog',
};

describe('useReportData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns undefined show when showId is empty', () => {
    const { result } = renderHook(() => useReportData({ ...defaultOptions, showId: '' }), {
      wrapper: createWrapper(),
    });

    expect(result.current.show).toBeUndefined();
    expect(mockGetShowById).not.toHaveBeenCalled();
    expect(mockGetTrialsByShow).not.toHaveBeenCalled();
  });

  it('fetches show data when showId is provided', async () => {
    const mockShow = { id: 'show-1', name: 'Spring Invitational 2026' };
    mockGetShowById.mockResolvedValue({ data: mockShow, error: null });
    mockGetTrialsByShow.mockResolvedValue({ data: [], error: null });
    mockGetClassesByTrialId.mockResolvedValue({ data: [], error: null });
    mockGetEntriesByShow.mockResolvedValue({ data: [], error: null });

    const { result } = renderHook(() => useReportData(defaultOptions), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.show).toEqual(mockShow));

    expect(mockGetShowById).toHaveBeenCalledWith('show-1');
  });

  it('fetches trials when showId is provided', async () => {
    const mockShow = { id: 'show-1', name: 'Spring Invitational 2026' };
    const mockTrials = [
      { id: 'trial-1', show_id: 'show-1', date: '2026-04-12' },
      { id: 'trial-2', show_id: 'show-1', date: '2026-04-13' },
    ];
    mockGetShowById.mockResolvedValue({ data: mockShow, error: null });
    mockGetTrialsByShow.mockResolvedValue({ data: mockTrials, error: null });
    mockGetClassesByTrialId.mockResolvedValue({ data: [], error: null });
    mockGetEntriesByShow.mockResolvedValue({ data: [], error: null });

    const { result } = renderHook(() => useReportData(defaultOptions), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.trials).toEqual(mockTrials));

    expect(mockGetTrialsByShow).toHaveBeenCalledWith('show-1');
  });

  it('fetches classes for all trials when trialId is "all"', async () => {
    const mockShow = { id: 'show-1', name: 'Spring Invitational 2026' };
    const mockTrials = [
      { id: 'trial-1', show_id: 'show-1', date: '2026-04-12' },
      { id: 'trial-2', show_id: 'show-1', date: '2026-04-13' },
    ];
    const mockClasses = [{ id: 'class-1', trial_id: 'trial-1', element: 'Buried' }];
    mockGetShowById.mockResolvedValue({ data: mockShow, error: null });
    mockGetTrialsByShow.mockResolvedValue({ data: mockTrials, error: null });
    mockGetClassesByTrialId.mockResolvedValue({ data: mockClasses, error: null });
    mockGetEntriesByShow.mockResolvedValue({ data: [], error: null });

    const { result } = renderHook(() => useReportData({ ...defaultOptions, trialId: 'all' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.classes).toBeDefined());

    expect(mockGetClassesByTrialId).toHaveBeenCalledWith('trial-1');
    expect(mockGetClassesByTrialId).toHaveBeenCalledWith('trial-2');
  });

  it('fetches classes for a specific trialId', async () => {
    const mockShow = { id: 'show-1', name: 'Spring Invitational 2026' };
    const mockTrials = [{ id: 'trial-1', show_id: 'show-1', date: '2026-04-12' }];
    const mockClasses = [{ id: 'class-1', trial_id: 'trial-1', element: 'Buried' }];
    mockGetShowById.mockResolvedValue({ data: mockShow, error: null });
    mockGetTrialsByShow.mockResolvedValue({ data: mockTrials, error: null });
    mockGetClassesByTrialId.mockResolvedValue({ data: mockClasses, error: null });
    mockGetEntriesByShow.mockResolvedValue({ data: [], error: null });

    const { result } = renderHook(() => useReportData({ ...defaultOptions, trialId: 'trial-1' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.classes).toEqual(mockClasses));

    expect(mockGetClassesByTrialId).toHaveBeenCalledWith('trial-1');
  });

  it('fetches entries by class when classId is specific', async () => {
    const mockShow = { id: 'show-1', name: 'Spring Invitational 2026' };
    const mockTrials = [{ id: 'trial-1', show_id: 'show-1', date: '2026-04-12' }];
    const mockClasses = [{ id: 'class-1', trial_id: 'trial-1', element: 'Buried' }];
    const mockEntries = [{ id: 'entry-1', class_id: 'class-1', dog_id: 'dog-1' }];
    mockGetShowById.mockResolvedValue({ data: mockShow, error: null });
    mockGetTrialsByShow.mockResolvedValue({ data: mockTrials, error: null });
    mockGetClassesByTrialId.mockResolvedValue({ data: mockClasses, error: null });
    mockGetEntriesByClass.mockResolvedValue({ data: mockEntries, error: null });

    const { result } = renderHook(
      () => useReportData({ ...defaultOptions, trialId: 'trial-1', classId: 'class-1' }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.entries).toEqual(mockEntries));

    expect(mockGetEntriesByClass).toHaveBeenCalledWith('class-1');
    expect(mockGetEntriesByShow).not.toHaveBeenCalled();
  });

  it('fetches entries by show when classId is "all"', async () => {
    const mockShow = { id: 'show-1', name: 'Spring Invitational 2026' };
    const mockTrials = [{ id: 'trial-1', show_id: 'show-1', date: '2026-04-12' }];
    const mockEntries = [
      { id: 'entry-1', class_id: 'class-1', dog_id: 'dog-1' },
      { id: 'entry-2', class_id: 'class-2', dog_id: 'dog-2' },
    ];
    mockGetShowById.mockResolvedValue({ data: mockShow, error: null });
    mockGetTrialsByShow.mockResolvedValue({ data: mockTrials, error: null });
    mockGetClassesByTrialId.mockResolvedValue({ data: [], error: null });
    mockGetEntriesByShow.mockResolvedValue({ data: mockEntries, error: null });

    const { result } = renderHook(() => useReportData(defaultOptions), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.entries).toEqual(mockEntries));

    expect(mockGetEntriesByShow).toHaveBeenCalledWith('show-1');
    expect(mockGetEntriesByClass).not.toHaveBeenCalled();
  });

  it('exposes isError when a query fails', async () => {
    const dbError = { message: 'DB connection failed', code: '500' };
    mockGetShowById.mockResolvedValue({ data: null, error: dbError as never });

    const { result } = renderHook(() => useReportData(defaultOptions), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
