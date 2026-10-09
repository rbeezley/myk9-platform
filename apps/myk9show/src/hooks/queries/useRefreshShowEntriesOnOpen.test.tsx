import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { ReplicationSyncContext } from '@/context/ReplicationSyncContext';

const mocks = vi.hoisted(() => ({
  hasSynced: vi.fn(),
  getEntriesForShow: vi.fn(),
  triggerSync: vi.fn(),
}));

vi.mock('@/services/replication/entriesShowSyncState', () => ({
  hasShowEntriesSynced: mocks.hasSynced,
}));
vi.mock('@/services/database/entries', () => ({
  getEntriesByShow: vi.fn(),
  getPublicEntriesByShow: vi.fn(),
  getEntriesByDog: vi.fn(),
  getEntriesByStatus: vi.fn(),
  getEntriesForShow: mocks.getEntriesForShow,
  searchEntries: vi.fn(),
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'u1' }, loading: false }),
}));

import { useSecretaryShowEntriesQuery } from './useEntriesDatabase';
import { resetShowOpenRefreshesForTests } from '@/services/database/entries/showOpenRefreshGate';

const TARGET = [{ name: 'entries', scopeId: 'show-1' }];

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
}

function makeStatus(overrides: { isSyncing?: boolean; lastSyncAt?: Date | null } = {}) {
  return {
    isSyncing: false,
    lastSyncAt: null as Date | null,
    error: null,
    tablesStatus: {},
    ...overrides,
  };
}

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({
    children,
    status,
  }: {
    children: ReactNode;
    status: ReturnType<typeof makeStatus>;
  }) => (
    <QueryClientProvider client={client}>
      <ReplicationSyncContext.Provider
        value={{ status, triggerSync: mocks.triggerSync, syncTable: vi.fn() }}
      >
        {children}
      </ReplicationSyncContext.Provider>
    </QueryClientProvider>
  );
  const render = () =>
    renderHook(() => useSecretaryShowEntriesQuery('show-1'), {
      wrapper: ({ children }) => wrapper({ children, status: currentStatus.value }),
    });
  const currentStatus = { value: makeStatus() };
  return {
    invalidate,
    currentStatus,
    render: (status = makeStatus()) => {
      currentStatus.value = status;
      return render();
    },
  };
}

const row = (id: string) => ({ id });
const settle = () => new Promise(resolve => setTimeout(resolve, 30));

describe('useRefreshShowEntriesOnOpen via the staff entries query (MYK9-1064)', () => {
  beforeEach(() => {
    mocks.triggerSync.mockReset().mockResolvedValue(undefined);
    mocks.hasSynced.mockReset().mockResolvedValue(true);
    mocks.getEntriesForShow.mockReset().mockResolvedValue({ data: [row('e1')], error: null });
    resetShowOpenRefreshesForTests();
    onlineManager.setOnline(true);
    setVisibility('visible');
  });

  afterEach(() => {
    onlineManager.setOnline(true);
    setVisibility('visible');
  });

  it('warm open: one scoped entries pass through the provider, and nothing else', async () => {
    const { invalidate, render } = setup();
    render();

    await waitFor(() => expect(mocks.triggerSync).toHaveBeenCalledTimes(1));
    expect(mocks.triggerSync).toHaveBeenCalledWith(TARGET);
    await settle();
    expect(invalidate).not.toHaveBeenCalled();
    expect(mocks.getEntriesForShow).toHaveBeenCalledTimes(1);
  });

  it('cold open: nothing is triggered', async () => {
    mocks.hasSynced.mockResolvedValue(false);
    const { invalidate, render } = setup();
    const view = render();

    await waitFor(() => expect(view.result.current.isSuccess).toBe(true));
    await settle();
    expect(mocks.triggerSync).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('offline: nothing is triggered', async () => {
    onlineManager.setOnline(false);
    const { render } = setup();
    render();
    await settle();

    expect(mocks.triggerSync).not.toHaveBeenCalled();
  });

  it('a second open inside 15 s does not trigger another pass', async () => {
    const { render } = setup();
    const first = render();
    await waitFor(() => expect(mocks.triggerSync).toHaveBeenCalledTimes(1));
    first.unmount();
    render();
    await settle();

    expect(mocks.triggerSync).toHaveBeenCalledTimes(1);
  });

  it('the provider status changing after the pass does not re-trigger it (no loop)', async () => {
    const { currentStatus, render } = setup();
    const view = render();
    await waitFor(() => expect(mocks.triggerSync).toHaveBeenCalledTimes(1));

    currentStatus.value = makeStatus({ lastSyncAt: new Date('2026-10-08T22:00:05Z') });
    view.rerender();
    await settle();

    expect(mocks.triggerSync).toHaveBeenCalledTimes(1);
  });
});
