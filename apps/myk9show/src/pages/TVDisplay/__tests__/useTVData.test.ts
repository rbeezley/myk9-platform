import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useTVData } from '../useTVData';
import { getTVDisplayData } from '@/services/database/tv-display';

vi.mock('@/services/database/tv-display', () => ({
  getTVDisplayData: vi.fn(),
}));

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return { Wrapper };
}

const mockTVData = {
  show: {
    id: 'show-1',
    name: 'Spring Trial 2026',
    startDate: '2026-04-01',
    endDate: '2026-04-02',
  },
  classes: [
    {
      id: 'class-1',
      name: 'Novice A',
      element: 'Container',
      level: 'Novice',
      status: 'In Progress',
      judgeName: 'John Smith',
      totalEntries: 10,
      scoredCount: 3,
      startTime: '09:00',
      trialDate: '2026-04-01',
      trialNumber: 1,
      entries: [
        {
          id: 'entry-1',
          armband: '42',
          handler: 'J. Martinez',
          runOrder: 1,
          isInRing: true,
          isScored: false,
          dog: {
            name: 'Luna Star',
            callName: 'Luna',
           
            imageUrl: null,
          },
        },
      ],
    },
  ],
};

describe('useTVData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getTVDisplayData).mockResolvedValue(mockTVData);
  });

  it('returns show info and active classes from the TV display service', async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useTVData('show-1'), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(getTVDisplayData).toHaveBeenCalledWith('show-1', undefined);
    expect(result.current.show).toEqual(mockTVData.show);
    expect(result.current.classes).toEqual(mockTVData.classes);
    expect(result.current.classes[0].entries[0].dog?.callName).toBe('Luna');
  });

  it('returns empty classes when show is not found', async () => {
    vi.mocked(getTVDisplayData).mockResolvedValue({ show: null, classes: [] });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useTVData('bad-id'), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.show).toBeNull();
    expect(result.current.classes).toEqual([]);
  });

  it('passes the trial ID to the TV display service when provided', async () => {
    const { Wrapper } = makeWrapper();
    renderHook(() => useTVData('show-1', 'trial-1'), { wrapper: Wrapper });

    await waitFor(() => expect(getTVDisplayData).toHaveBeenCalledWith('show-1', 'trial-1'));
  });
});
