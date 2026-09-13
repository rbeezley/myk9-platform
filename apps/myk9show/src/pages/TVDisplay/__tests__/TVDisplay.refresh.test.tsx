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
  version: 4,
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
  version: 5,
  name: 'Exterior Novice',
  element: 'Exterior',
  level: 'Novice',
  judgeName: 'Lee',
  totalEntries: 8,
  qualifiedCount: 6,
  fastestTime: 35,
  placements: [
    {
      placement: 1,
      armband: '42',
      handler: 'A. Smith',
      searchTime: 35,
      totalScore: null,
      dog: { name: 'Scout', callName: 'Scout', imageUrl: null },
    },
  ],
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

describe.each([false, true])('completed result visibility at desktop=%s', desktop => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: desktop,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    sessionStorage.clear();
  });

  it('does not present a finalized class without public placements', () => {
    const client = createTestQueryClient();
    client.setQueryData([...queryKeys.tvClasses('show-proof'), undefined], {
      ...boardData,
      classes: [],
    });
    client.setQueryData(
      [...queryKeys.tvResults('show-proof'), undefined],
      [{ ...completedClass, placements: [] }]
    );
    render(<TVDisplay />, { initialRoute: '/tv/show-proof', queryClient: client });
    expect(screen.queryByText('Exterior Novice')).not.toBeInTheDocument();
    expect(screen.queryByText('Final Results')).not.toBeInTheDocument();
    expect(screen.getByText('No classes currently in progress')).toBeInTheDocument();
    client.clear();
  });

  it('shows a released result once even if a stale active request finishes later', () => {
    const client = createTestQueryClient();
    client.setQueryData([...queryKeys.tvClasses('show-proof'), undefined], boardData, {
      updatedAt: Date.now(),
    });
    client.setQueryData(
      [...queryKeys.tvResults('show-proof'), undefined],
      [{ ...completedClass, id: activeClass.id, name: activeClass.name }],
      { updatedAt: Date.now() - 1000 }
    );
    sessionStorage.setItem('tv-shown-podiums-show-proof', JSON.stringify([activeClass.id]));
    render(<TVDisplay />, { initialRoute: '/tv/show-proof', queryClient: client });
    expect(screen.getAllByText('Interior Advanced')).toHaveLength(1);
    expect(screen.getByText('COMPLETED')).toBeInTheDocument();
    expect(screen.queryByText('IN PROGRESS')).not.toBeInTheDocument();
    client.clear();
  });

  it('shows a reopened active class when its old results refresh fails', async () => {
    vi.mocked(getTVDisplayData).mockReset().mockResolvedValue(boardData);
    vi.mocked(getTVDisplayResults).mockReset().mockRejectedValue(new Error('injected 503'));
    const client = createTestQueryClient();
    client.setQueryData([...queryKeys.tvClasses('show-proof'), undefined], {
      ...boardData,
      classes: [{ ...activeClass, version: 6 }],
    });
    client.setQueryData(
      [...queryKeys.tvResults('show-proof'), undefined],
      [{ ...completedClass, id: activeClass.id, name: activeClass.name, version: 5 }]
    );
    sessionStorage.setItem('tv-shown-podiums-show-proof', JSON.stringify([activeClass.id]));
    render(<TVDisplay />, { initialRoute: '/tv/show-proof', queryClient: client });
    await act(async () => {
      await client.invalidateQueries({ queryKey: queryKeys.tvResults('show-proof') });
    });
    await waitFor(() =>
      expect(client.getQueryState([...queryKeys.tvResults('show-proof'), undefined])?.status).toBe(
        'error'
      )
    );
    expect(screen.getAllByText('Interior Advanced')).toHaveLength(1);
    expect(screen.getByText('IN PROGRESS')).toBeInTheDocument();
    expect(screen.queryByText('COMPLETED')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/Updates delayed/i);
    client.clear();
  });

  it('retains a finalized result when only its results refresh fails', async () => {
    vi.mocked(getTVDisplayData).mockReset().mockResolvedValue(boardData);
    vi.mocked(getTVDisplayResults).mockReset().mockRejectedValue(new Error('injected 503'));
    const client = createTestQueryClient();
    client.setQueryData([...queryKeys.tvClasses('show-proof'), undefined], {
      ...boardData,
      classes: [{ ...activeClass, version: 4 }],
    });
    client.setQueryData(
      [...queryKeys.tvResults('show-proof'), undefined],
      [{ ...completedClass, id: activeClass.id, name: activeClass.name, version: 5 }]
    );
    sessionStorage.setItem('tv-shown-podiums-show-proof', JSON.stringify([activeClass.id]));
    render(<TVDisplay />, { initialRoute: '/tv/show-proof', queryClient: client });
    await act(async () => {
      await client.invalidateQueries({ queryKey: queryKeys.tvResults('show-proof') });
    });
    await waitFor(() =>
      expect(client.getQueryState([...queryKeys.tvResults('show-proof'), undefined])?.status).toBe(
        'error'
      )
    );
    expect(screen.getAllByText('Interior Advanced')).toHaveLength(1);
    expect(screen.getByText('COMPLETED')).toBeInTheDocument();
    expect(screen.queryByText('IN PROGRESS')).not.toBeInTheDocument();
    client.clear();
  });

  it('shows a newer reopened class even if the old results query is healthy', () => {
    const client = createTestQueryClient();
    client.setQueryData([...queryKeys.tvClasses('show-proof'), undefined], {
      ...boardData,
      classes: [{ ...activeClass, version: 6 }],
    });
    client.setQueryData(
      [...queryKeys.tvResults('show-proof'), undefined],
      [{ ...completedClass, id: activeClass.id, name: activeClass.name, version: 5 }]
    );
    sessionStorage.setItem('tv-shown-podiums-show-proof', JSON.stringify([activeClass.id]));
    render(<TVDisplay />, { initialRoute: '/tv/show-proof', queryClient: client });
    expect(screen.getAllByText('Interior Advanced')).toHaveLength(1);
    expect(screen.getByText('IN PROGRESS')).toBeInTheDocument();
    expect(screen.queryByText('COMPLETED')).not.toBeInTheDocument();
    client.clear();
  });
});

it.each(['active', 'results'] as const)(
  'automatically retries a failed %s query while realtime remains connected',
  async branch => {
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    sessionStorage.clear();
    vi.mocked(getTVDisplayData).mockReset().mockResolvedValue(boardData);
    vi.mocked(getTVDisplayResults).mockReset().mockResolvedValue([completedClass]);
    const client = createTestQueryClient();
    try {
      render(<TVDisplay />, { initialRoute: '/tv/show-proof', queryClient: client });
      await screen.findByText('Interior Advanced');
      await screen.findByText('Exterior Novice');
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });

      const service = branch === 'active' ? getTVDisplayData : getTVDisplayResults;
      vi.mocked(service).mockRejectedValueOnce(new Error('injected 503'));
      const key =
        branch === 'active' ? queryKeys.tvClasses('show-proof') : queryKeys.tvResults('show-proof');
      await act(async () => {
        await client.invalidateQueries({ queryKey: key });
      });
      await waitFor(() => expect(client.getQueryState([...key, undefined])?.status).toBe('error'));
      expect(screen.getByRole('status')).toHaveTextContent(/Updates delayed/i);

      act(() => vi.advanceTimersByTime(30_000));
      await waitFor(() =>
        expect(client.getQueryState([...key, undefined])?.status).toBe('success')
      );
      expect(service).toHaveBeenCalledTimes(3);
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
      client.clear();
    }
  }
);

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
