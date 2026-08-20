/**
 * Tests for RingsideShowBoundary — the `/at-show` resilience boundary.
 *
 * The per-show `unified_ringside_enabled` feature flag was removed pre-launch
 * (see docs/plan-remove-unified-ringside-flag.md); what remains is resilience:
 * loading spinner, error+retry, missing-show notice (never a 404), and — for any
 * show that loads — rendering the children.
 */

import { Routes, Route } from 'react-router-dom';
import type { ReactNode } from 'react';
import { onlineManager } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestQueryClient, render, screen, act } from '@/test/utils/testUtils';
import { RingsideShowBoundary } from './RingsideShowBoundary';
import { replicatedShowsTable } from '@/services/replication';
import { UserRole } from '@/types/auth-types';

const { authState, networkState } = vi.hoisted(() => ({
  authState: {
    user: null as { id: string; is_anonymous?: boolean } | null,
    roles: [] as UserRole[],
  },
  networkState: { isOnline: true },
}));

vi.mock('@/services/replication', () => ({
  replicatedShowsTable: {
    getShowById: vi.fn(),
    sync: vi.fn(),
    updateSyncMetadata: vi.fn(),
  },
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: authState.user,
    hasRole: (role: UserRole) => authState.roles.includes(role),
  }),
}));

vi.mock('@/lib/networkUtils', () => ({
  useOnlineStatus: () => networkState.isOnline,
}));

vi.mock('@/features/offline-readiness/OfflineReadyBadge', () => ({
  OfflineReadyBadge: ({ showId }: { showId: string }) => (
    <button type="button">Load this show onto this device ({showId})</button>
  ),
}));

const CHILD = 'RINGSIDE CONTENT';

function boundaryRoutes(showId: string, child: ReactNode = <div>{CHILD}</div>) {
  return (
    <Routes>
      <Route
        path="/at-show/:showId"
        element={<RingsideShowBoundary>{child}</RingsideShowBoundary>}
      />
    </Routes>
  );
}

function renderBoundary(
  showId: string,
  queryClient = createTestQueryClient(),
  child?: ReactNode
) {
  return render(
    boundaryRoutes(showId, child),
    { initialRoute: `/at-show/${showId}`, queryClient }
  );
}

describe('RingsideShowBoundary', () => {
  beforeEach(() => {
    onlineManager.setOnline(true);
    vi.mocked(replicatedShowsTable.getShowById).mockReset();
    vi.mocked(replicatedShowsTable.sync)
      .mockReset()
      .mockResolvedValue({ success: true } as never);
    vi.mocked(replicatedShowsTable.updateSyncMetadata).mockReset().mockResolvedValue(undefined);
    authState.user = null;
    authState.roles = [];
    networkState.isOnline = true;
  });

  it('shows a loading state while the show is being fetched', () => {
    // Never-resolving promise keeps the query in its loading state.
    vi.mocked(replicatedShowsTable.getShowById).mockReturnValue(new Promise(() => {}) as never);
    renderBoundary('show-loading');
    expect(screen.getByRole('status', { name: 'Loading ringside…' })).toBeInTheDocument();
    expect(screen.queryByText(CHILD)).not.toBeInTheDocument();
  });

  it('renders children for any show that loads (no feature-flag gate)', async () => {
    vi.mocked(replicatedShowsTable.getShowById).mockResolvedValue({ id: 'show-on' } as never);
    renderBoundary('show-on');
    expect(await screen.findByText(CHILD)).toBeInTheDocument();
  });

  it('reads a durable cached show while React Query is offline', async () => {
    networkState.isOnline = false;
    onlineManager.setOnline(false);
    vi.mocked(replicatedShowsTable.getShowById).mockResolvedValue({ id: 'show-offline' } as never);

    renderBoundary('show-offline');

    expect(await screen.findByText(CHILD)).toBeInTheDocument();
    expect(replicatedShowsTable.getShowById).toHaveBeenCalledWith('show-offline');
    expect(screen.queryByText("This show isn't saved on this device")).not.toBeInTheDocument();
  });

  it('keeps an open nested scoresheet mounted while transitioning offline', async () => {
    const queryClient = createTestQueryClient();
    vi.mocked(replicatedShowsTable.getShowById)
      .mockResolvedValueOnce({ id: 'show-transition' } as never)
      // Model an IndexedDB read that has not settled yet. Already-rendered
      // ringside work must stay available during this transition.
      .mockReturnValueOnce(new Promise(() => {}) as never);

    const view = renderBoundary(
      'show-transition',
      queryClient,
      <div data-testid="nested-scoresheet">Open scoresheet</div>
    );
    expect(await screen.findByTestId('nested-scoresheet')).toBeInTheDocument();

    networkState.isOnline = false;
    onlineManager.setOnline(false);
    view.rerender(
      boundaryRoutes(
        'show-transition',
        <div data-testid="nested-scoresheet">Open scoresheet</div>
      )
    );

    expect(screen.getByTestId('nested-scoresheet')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading ringside…' })).not.toBeInTheDocument();
  });

  it('renders the missing-show notice (not a 404) when the show is absent', async () => {
    vi.mocked(replicatedShowsTable.getShowById).mockResolvedValue(null as never);
    renderBoundary('show-missing');
    expect(await screen.findByText('Show not found')).toBeInTheDocument();
    expect(screen.queryByText(CHILD)).not.toBeInTheDocument();
  });

  it('offers staff a way to prepare an uncached show while offline', async () => {
    networkState.isOnline = false;
    authState.user = { id: 'judge-1', is_anonymous: false };
    authState.roles = [UserRole.JUDGE];
    vi.mocked(replicatedShowsTable.getShowById).mockResolvedValue(null as never);

    renderBoundary('show-cold-offline');

    expect(await screen.findByText("This show isn't saved on this device")).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /load this show onto this device/i })
    ).toBeInTheDocument();
    expect(screen.queryByText('Show not found')).not.toBeInTheDocument();
    expect(replicatedShowsTable.sync).not.toHaveBeenCalled();
  });

  it('keeps the original not-found state for a genuinely unknown online show', async () => {
    authState.user = { id: 'judge-1', is_anonymous: false };
    authState.roles = [UserRole.JUDGE];
    vi.mocked(replicatedShowsTable.getShowById).mockResolvedValue(null as never);
    renderBoundary('show-unknown');

    expect(await screen.findByText('Show not found')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /load this show/i })).not.toBeInTheDocument();
    expect(replicatedShowsTable.sync).toHaveBeenCalledWith('');
    expect(replicatedShowsTable.updateSyncMetadata).toHaveBeenCalledWith({
      lastIncrementalSyncAt: 0,
      scopes: {},
    });
  });

  it('refetches after show replication sync invalidates the shows cache', async () => {
    const queryClient = createTestQueryClient();
    networkState.isOnline = false;
    vi.mocked(replicatedShowsTable.getShowById)
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce({ id: 'show-after-sync' } as never);

    renderBoundary('show-after-sync', queryClient);
    expect(await screen.findByText("This show isn't saved on this device")).toBeInTheDocument();

    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['shows'] });
    });

    expect(await screen.findByText(CHILD)).toBeInTheDocument();
    expect(replicatedShowsTable.getShowById).toHaveBeenCalledTimes(2);
  });

  it('renders an error state (not the missing-show notice) when the fetch fails', async () => {
    vi.mocked(replicatedShowsTable.getShowById).mockRejectedValue(new Error('network down'));
    renderBoundary('show-error');
    expect(await screen.findByText('Oops! Something went wrong')).toBeInTheDocument();
    expect(screen.queryByText('Show not found')).not.toBeInTheDocument();
    expect(screen.queryByText(CHILD)).not.toBeInTheDocument();
  });
});
