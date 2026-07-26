import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useTVResults } from '../useTVResults';
import { getTVDisplayResults } from '@/services/database/tv-display';

vi.mock('@/services/database/tv-display', () => ({
  getTVDisplayResults: vi.fn(),
}));

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return { Wrapper };
}

const mockCompletedClasses = [
  {
    id: 'class-done',
    name: 'Advanced',
    element: 'Interior',
    level: 'Advanced',
    judgeName: 'Alice Smith',
    totalEntries: 20,
    qualifiedCount: 3,
    fastestTime: 35.1,
    placements: [
      {
        placement: 1,
        armband: '42',
        handler: 'J. Martinez',
        searchTime: 35.1,
        totalScore: null,
        dog: {
          name: 'Luna Star',
          callName: 'Luna',
         
          imageUrl: null,
        },
      },
    ],
  },
];

describe('useTVResults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getTVDisplayResults).mockResolvedValue(mockCompletedClasses);
  });

  it('returns completed classes from the TV display service', async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useTVResults('show-1'), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(getTVDisplayResults).toHaveBeenCalledWith('show-1', undefined);
    expect(result.current.completedClasses).toEqual(mockCompletedClasses);
    expect(result.current.completedClasses[0].placements[0].dog?.callName).toBe('Luna');
  });

  it('returns an empty array when no finalized classes are found', async () => {
    vi.mocked(getTVDisplayResults).mockResolvedValue([]);

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useTVResults('show-1'), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.completedClasses).toEqual([]);
  });

  it('does not run query when showId is empty', () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useTVResults(''), { wrapper: Wrapper });

    expect(getTVDisplayResults).not.toHaveBeenCalled();
    expect(result.current.completedClasses).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('passes the trial ID to the TV display service when provided', async () => {
    const { Wrapper } = makeWrapper();
    renderHook(() => useTVResults('show-1', 'trial-abc'), { wrapper: Wrapper });

    await waitFor(() => expect(getTVDisplayResults).toHaveBeenCalledWith('show-1', 'trial-abc'));
  });
});
