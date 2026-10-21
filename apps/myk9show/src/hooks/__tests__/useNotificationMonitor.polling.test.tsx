import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { vi } from 'vitest';
import type {
  ShowChangeListener,
  ShowChangeStatus,
  ShowChangeStatusListener,
} from '@/features/show-live-sync/showChangeSignal';
import { subscribeToShowChanges } from '@/features/show-live-sync/showChangeSignal';
import { useNotificationMonitor } from '../useNotificationMonitor';
import { classRow, entry } from './notificationMonitorFixtures';

// MYK9-1306: the monitor polls only with a watch set, and never while every show
// channel is subscribed.
// The real useQuery and useShowChannelsLive run here; only the I/O is mocked.

const mocks = vi.hoisted(() => ({
  deliver: vi.fn(),
  from: vi.fn(),
  dogs: [{ id: 'dog-1' }] as Array<{ id: string }>,
  online: true,
  tables: {
    classes: [] as unknown[],
    view_authenticated_entry_results: [] as unknown[],
  },
  preferences: {
    enabled: true,
    leadDogs: 3,
    soundEnabled: true,
    voiceEnabled: false,
    vibrationEnabled: true,
    pushEnabled: false,
  },
}));

let changeListener: ShowChangeListener | undefined;
let statusListener: ShowChangeStatusListener | undefined;
let currentStatus: ShowChangeStatus | undefined;

vi.mock('@/features/show-live-sync/showChangeSignal', () => ({
  subscribeToShowChanges: vi.fn(
    (_showId: string, listener: ShowChangeListener, status?: ShowChangeStatusListener) => {
      // The monitor registers the real listener; the channel hook a no-op with a status listener.
      if (status) {
        statusListener = status;
        if (currentStatus) status(currentStatus);
      } else {
        changeListener = listener;
      }
      return vi.fn();
    }
  ),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: mocks.from,
    functions: { invoke: vi.fn() },
  },
}));
vi.mock('@/hooks/useNetworkStatus', () => ({ useIsOnline: () => mocks.online }));
vi.mock('@/hooks/useNotificationDelivery', () => ({
  useNotificationDelivery: () => ({ deliver: mocks.deliver }),
}));
vi.mock('@/store/notificationStore', () => ({
  useNotificationStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ preferences: mocks.preferences }),
}));
vi.mock('@/hooks/queries/useShowDayData', () => ({
  useShowDayData: () => ({ activeShows: [{ showId: 'show-1' }] }),
}));
vi.mock('@/store/showStore', () => ({
  useShowStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ selectedShowId: null }),
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ userWithRoles: { databaseUserId: 'user-1', id: 'auth-user-1' } }),
}));
vi.mock('@/hooks/queries/useDogsDatabase', () => ({
  useDogsByOwnerQuery: () => ({ data: mocks.dogs }),
}));
vi.mock('@/features/at-show/dogFavoritesSync', () => ({
  useFavoriteArmbandsByShow: () => new Map<string, ReadonlySet<number>>(),
}));
vi.mock('@/utils/conflictDetection', () => ({ detectConflicts: vi.fn(() => []) }));

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const classesWithShow = (overrides: Record<string, unknown> = {}) => [
  { ...classRow(overrides), trial: { show_id: 'show-1' } },
];

function setServer(classOverrides: Record<string, unknown> = {}) {
  mocks.tables.classes = classesWithShow(classOverrides);
  mocks.tables.view_authenticated_entry_results = [entry({ check_in_status: 'no-status' })];
}

function fromCalls(table: string): number {
  return mocks.from.mock.calls.filter(([name]) => name === table).length;
}

function deliveredTypes(): string[] {
  return mocks.deliver.mock.calls.map(([payload]) => (payload as { type: string }).type);
}

async function flush() {
  await act(async () => {
    // react-query notifies observers on a 0 ms timer queued by the fetch that just resolved.
    await vi.advanceTimersByTimeAsync(10);
  });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  await flush();
}

async function broadcast() {
  await act(async () => {
    changeListener?.({ table: 'classes' });
    await vi.advanceTimersByTimeAsync(400);
  });
}

describe('useNotificationMonitor polling (MYK9-1306)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    changeListener = undefined;
    statusListener = undefined;
    currentStatus = undefined;
    mocks.dogs = [{ id: 'dog-1' }];
    mocks.online = true;
    mocks.preferences.enabled = true;
    mocks.from.mockImplementation((table: keyof typeof mocks.tables) => {
      const result = { data: mocks.tables[table], error: null };
      const chain = { select: () => chain, in: () => Promise.resolve(result) };
      return chain;
    });
    setServer();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('never queries with an empty watch set', async () => {
    mocks.dogs = [];
    renderHook(() => useNotificationMonitor(), { wrapper });
    await flush();
    await advance(61_000);

    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('does not poll while the channel is SUBSCRIBED, yet a broadcast still alerts', async () => {
    currentStatus = 'SUBSCRIBED';
    renderHook(() => useNotificationMonitor(), { wrapper });
    await flush();
    expect(fromCalls('classes')).toBe(1);

    await advance(95_000);
    expect(fromCalls('classes')).toBe(1);

    setServer({ status: 'In Progress' });
    await broadcast();
    expect(fromCalls('classes')).toBe(2);
    expect(deliveredTypes()).toContain('class_starting');
  });

  it('keeps polling every 30 s while the channel is CLOSED and still alerts', async () => {
    currentStatus = 'CLOSED';
    renderHook(() => useNotificationMonitor(), { wrapper });
    await flush();
    expect(fromCalls('classes')).toBe(1);

    setServer({ status: 'In Progress' });
    await advance(30_000);
    expect(fromCalls('classes')).toBe(2);
    expect(deliveredTypes()).toContain('class_starting');
  });

  it('polls while offline even if the channel last reported SUBSCRIBED', async () => {
    currentStatus = 'SUBSCRIBED';
    mocks.online = false;
    renderHook(() => useNotificationMonitor(), { wrapper });
    await flush();

    await advance(30_000);
    expect(fromCalls('classes')).toBe(2);
  });

  it('resumes polling when a subscribed channel drops', async () => {
    currentStatus = 'SUBSCRIBED';
    renderHook(() => useNotificationMonitor(), { wrapper });
    await flush();
    await advance(95_000);
    expect(fromCalls('classes')).toBe(1);

    await act(async () => {
      statusListener?.('TIMED_OUT');
    });
    await advance(30_000);
    expect(fromCalls('classes')).toBe(2);
  });

  it('refetches once when a channel returns to SUBSCRIBED after a gap', async () => {
    currentStatus = 'CLOSED';
    renderHook(() => useNotificationMonitor(), { wrapper });
    await flush();
    expect(fromCalls('classes')).toBe(1);

    setServer({ status: 'In Progress' });
    await act(async () => {
      statusListener?.('SUBSCRIBED');
    });
    await flush();

    expect(fromCalls('classes')).toBe(2);
    expect(deliveredTypes()).toContain('class_starting');
  });

  it('opens no channel when notifications are off', async () => {
    mocks.preferences.enabled = false;
    renderHook(() => useNotificationMonitor(), { wrapper });
    await flush();

    expect(subscribeToShowChanges).not.toHaveBeenCalled();
    mocks.preferences.enabled = true;
  });

  it('takes a silent baseline after the watch set goes empty and non-empty again', async () => {
    currentStatus = 'CLOSED';
    const { rerender } = renderHook(() => useNotificationMonitor(), { wrapper });
    await flush();

    mocks.dogs = [];
    rerender();
    await flush();
    setServer({ status: 'In Progress' });
    mocks.dogs = [{ id: 'dog-1' }];
    rerender();
    await flush();
    await advance(1_000);
    expect(deliveredTypes()).toEqual([]);

    setServer({ status: 'In Progress', is_scoring_finalized: true });
    await advance(30_000);
    expect(deliveredTypes()).toContain('results_posted');
  });
});
