import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@/test/utils/testUtils';
import { useExhibitorResults } from './useExhibitorResults';
import {
  DOG_PAGE_REPLICA_REFRESH_COALESCE_MS,
  OPEN_DOG_PAGE_POLL_MAX_MS,
  OPEN_DOG_PAGE_POLL_MIN_MS,
  OPEN_DOG_PAGE_STALE_MS,
} from './useExhibitorResultsRefresh';

type Rows = Array<Record<string, unknown>>;
const mocks = vi.hoisted(() => ({
  range: vi.fn(),
  dogsQuery: vi.fn(),
  profile: vi.fn(),
  listeners: new Set<(rows: Rows) => void>(),
  unsubscribe: vi.fn(),
}));
vi.mock('@/hooks/useExhibitorProfile', () => ({ useExhibitorProfile: mocks.profile }));
vi.mock('./useDogsDatabase', () => ({ useDogsQuery: mocks.dogsQuery }));
vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: {
    subscribe: (cb: (rows: Rows) => void) => {
      mocks.listeners.add(cb);
      return () => {
        mocks.listeners.delete(cb);
        mocks.unsubscribe();
      };
    },
  },
}));
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'trials') {
        return { select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) };
      }
      const query = {
        select: () => query,
        in: () => query,
        eq: () => query,
        is: () => query,
        order: () => query,
        range: mocks.range,
      };
      return query;
    },
  },
}));

const emit = (rows: Rows) => mocks.listeners.forEach(cb => cb(rows));
const entry = (overrides: Record<string, unknown> = {}) => ({
  id: 'entry-1',
  dogId: 'dog-a',
  isScored: false,
  ...overrides,
});

function DogPage() {
  const { data } = useExhibitorResults('dog-a');
  return <p>{data ? 'ready' : 'loading'}</p>;
}

const observerOptions = (client: QueryClient) =>
  client.getQueryCache().findAll({ queryKey: ['exhibitor', 'results'] })[0]!.observers[0]!.options;

// A real client policy: the shared test client turns refetchOnMount off.
const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

beforeEach(() => {
  mocks.listeners.clear();
  mocks.unsubscribe.mockClear();
  mocks.profile.mockReturnValue({ isLoading: false });
  mocks.dogsQuery.mockReturnValue({
    data: [{ id: 'dog-a' }, { id: 'dog-b' }],
    isLoading: false,
    isError: false,
  });
  mocks.range.mockReset().mockResolvedValue({ data: [], error: null });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('open dog page refresh policy (MYK9-1361)', () => {
  it('sets a jittered 3 to 5 minute interval, stable across re-renders, visible-tab only', async () => {
    const client = newClient();
    const { rerender } = render(<DogPage />, { queryClient: client });
    await screen.findByText('ready');
    const options = () => observerOptions(client);
    const interval = options().refetchInterval as number;
    expect(interval).toBeGreaterThanOrEqual(OPEN_DOG_PAGE_POLL_MIN_MS);
    expect(interval).toBeLessThanOrEqual(OPEN_DOG_PAGE_POLL_MAX_MS);
    expect(OPEN_DOG_PAGE_POLL_MIN_MS).toBe(180_000);
    expect(OPEN_DOG_PAGE_POLL_MAX_MS).toBe(300_000);
    expect(options().staleTime).toBe(60_000);
    expect(OPEN_DOG_PAGE_STALE_MS).toBe(60_000);
    expect(options().refetchIntervalInBackground).toBe(false);
    expect(options().networkMode).toBe('online');
    expect(options().refetchOnMount).toBeUndefined();
    rerender(<DogPage />);
    expect(options().refetchInterval).toBe(interval);
  });

  it('draws the interval uniformly from the range, once per mount', async () => {
    const random = vi.spyOn(Math, 'random');
    try {
      random.mockReturnValue(0);
      const low = newClient();
      render(<DogPage />, { queryClient: low });
      await screen.findByText('ready');
      expect(observerOptions(low).refetchInterval).toBe(180_000);
      random.mockReturnValue(0.999999);
      const high = newClient();
      render(<DogPage />, { queryClient: high });
      await waitFor(() => expect(mocks.range).toHaveBeenCalledTimes(2));
      expect(observerOptions(high).refetchInterval).toBeLessThanOrEqual(300_000);
      expect(observerOptions(high).refetchInterval).toBeGreaterThan(299_000);
    } finally {
      random.mockRestore();
    }
  });

  it('does not refetch on a remount inside the stale time', async () => {
    const client = newClient();
    const first = render(<DogPage />, { queryClient: client });
    await screen.findByText('ready');
    expect(mocks.range).toHaveBeenCalledTimes(1);
    first.unmount();
    render(<DogPage />, { queryClient: client });
    await screen.findByText('ready');
    expect(mocks.range).toHaveBeenCalledTimes(1);
  });

  it('refetches once when the dog entries change in the replica, ignoring other dogs', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const client = newClient();
    render(<DogPage />, { queryClient: client });
    await screen.findByText('ready');
    expect(mocks.range).toHaveBeenCalledTimes(1);

    // First snapshot is the baseline; an unrelated dog's change is not a refresh.
    await act(async () => {
      emit([entry(), entry({ id: 'other', dogId: 'dog-z' })]);
    });
    await act(async () => {
      emit([entry(), entry({ id: 'other', dogId: 'dog-z', isScored: true })]);
    });
    expect(mocks.range).toHaveBeenCalledTimes(1);

    // A score landing on this dog's entry refreshes at once.
    await act(async () => {
      emit([entry({ isScored: true, resultStatus: 'qualified' })]);
    });
    await waitFor(() => expect(mocks.range).toHaveBeenCalledTimes(2));
  });

  it('coalesces a burst of replica changes into one trailing refetch per window', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const client = newClient();
    render(<DogPage />, { queryClient: client });
    await screen.findByText('ready');
    await act(async () => {
      emit([entry()]);
    });
    await act(async () => {
      emit([entry({ finalPlacement: '1' })]);
    });
    await waitFor(() => expect(mocks.range).toHaveBeenCalledTimes(2));

    await act(async () => {
      emit([entry({ finalPlacement: '2' })]);
      emit([entry({ finalPlacement: '3' })]);
      emit([entry({ finalPlacement: '4' })]);
    });
    expect(mocks.range).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DOG_PAGE_REPLICA_REFRESH_COALESCE_MS + 100);
    });
    await waitFor(() => expect(mocks.range).toHaveBeenCalledTimes(3));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DOG_PAGE_REPLICA_REFRESH_COALESCE_MS * 2);
    });
    expect(mocks.range).toHaveBeenCalledTimes(3);
  });

  it('stops listening to the replica when the dog page unmounts', async () => {
    const client = newClient();
    const view = render(<DogPage />, { queryClient: client });
    await screen.findByText('ready');
    expect(mocks.listeners.size).toBe(1);
    view.unmount();
    expect(mocks.listeners.size).toBe(0);
  });
});
