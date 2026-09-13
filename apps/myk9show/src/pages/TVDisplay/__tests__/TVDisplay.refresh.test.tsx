import { act, render, screen, waitFor, createTestQueryClient } from '@/test/utils/testUtils';
import { queryKeys } from '@/lib/queryClient';
import { getTVDisplayData, getTVDisplayResults } from '@/services/database/tv-display';
import type { TVClass, TVCompletedClass, TVDisplayData } from '../types';
import { vi } from 'vitest';
import TVDisplay from '../index';

vi.mock('@/services/database/tv-display', () => ({
  getTVDisplayData: vi.fn(),
  getTVDisplayResults: vi.fn(),
}));
vi.mock('../useTVRealtime', () => ({
  useTVRealtime: () => ({ isConnected: true }),
}));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useParams: () => ({ showId: 'show-proof' }) };
});

const activeClass: TVClass = {
  id: 'class-active',
  name: 'Interior Advanced',
  element: 'Interior',
  level: 'Advanced',
  status: 'In Progress',
  judgeName: 'Smith',
  totalEntries: 10,
  scoredCount: 3,
  startTime: null,
  trialDate: null,
  trialNumber: null,
  entries: [],
};

const completedClass: TVCompletedClass = {
  id: 'class-completed',
  name: 'Exterior Novice',
  element: 'Exterior',
  level: 'Novice',
  judgeName: 'Lee',
  totalEntries: 8,
  qualifiedCount: 6,
  fastestTime: 35,
  placements: [],
};

const boardData: TVDisplayData = {
  show: {
    id: 'show-proof',
    name: 'Synthetic Trial',
    startDate: '2026-09-13',
    endDate: '2026-09-13',
  },
  classes: [activeClass],
};

describe.each([false, true])('TVDisplay refresh at desktop=%s', desktop => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: desktop,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    vi.mocked(getTVDisplayData).mockReset().mockResolvedValue(boardData);
    vi.mocked(getTVDisplayResults).mockReset().mockResolvedValue([completedClass]);
    sessionStorage.clear();
  });

  it.each(['active', 'results'] as const)(
    'keeps cached content but flags failed %s refresh until recovery',
    async branch => {
      const client = createTestQueryClient();
      render(<TVDisplay />, { initialRoute: '/tv/show-proof', queryClient: client });
      await screen.findByText('Interior Advanced');
      expect(screen.getByText(/Live/)).toBeInTheDocument();

      const service = branch === 'active' ? getTVDisplayData : getTVDisplayResults;
      vi.mocked(service).mockRejectedValueOnce(new Error('injected 503'));
      const key =
        branch === 'active' ? queryKeys.tvClasses('show-proof') : queryKeys.tvResults('show-proof');
      await act(async () => {
        await client.invalidateQueries({ queryKey: key });
      });
      await waitFor(() => expect(client.getQueryState([...key, undefined])?.status).toBe('error'));

      expect(screen.getByText('Interior Advanced')).toBeInTheDocument();
      expect(screen.getAllByText('Exterior Novice').length).toBeGreaterThan(0);
      expect(screen.getByRole('status')).toHaveTextContent(/Updates delayed/i);
      expect(screen.queryByText(/Live/)).not.toBeInTheDocument();

      await act(async () => {
        await client.invalidateQueries({ queryKey: key });
      });
      await waitFor(() =>
        expect(client.getQueryState([...key, undefined])?.status).toBe('success')
      );
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(screen.getByText(/Live/)).toBeInTheDocument();
      client.clear();
    }
  );
});

it('keeps completed results visible after a completed-only podium ends', () => {
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  sessionStorage.clear();
  const client = createTestQueryClient();
  client.setQueryData([...queryKeys.tvClasses('show-proof'), undefined], {
    ...boardData,
    classes: [],
  });
  client.setQueryData([...queryKeys.tvResults('show-proof'), undefined], [completedClass]);
  vi.useFakeTimers();
  try {
    render(<TVDisplay />, { initialRoute: '/tv/show-proof', queryClient: client });
    expect(screen.getByText('Final Results')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(20_000));

    expect(screen.queryByText('Final Results')).not.toBeInTheDocument();
    expect(screen.getByText('Completed classes')).toBeInTheDocument();
    expect(screen.getByText('Exterior Novice')).toBeInTheDocument();
    expect(screen.queryByText('No classes currently in progress')).not.toBeInTheDocument();
    expect(client.getQueryData([...queryKeys.tvResults('show-proof'), undefined])).toEqual([
      completedClass,
    ]);
  } finally {
    vi.useRealTimers();
    client.clear();
  }
});
