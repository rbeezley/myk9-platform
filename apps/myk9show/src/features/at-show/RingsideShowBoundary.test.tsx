/**
 * Tests for RingsideShowBoundary — the `/at-show` resilience boundary.
 *
 * The per-show `unified_ringside_enabled` feature flag was removed pre-launch
 * (see docs/plan-remove-unified-ringside-flag.md); what remains is resilience:
 * loading spinner, error+retry, missing-show notice (never a 404), and — for any
 * show that loads — rendering the children.
 */

import { Link, Routes, Route } from 'react-router-dom';
import type { ReactNode } from 'react';
import { onlineManager } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestQueryClient, render, screen, act } from '@/test/utils/testUtils';
import { RingsideShowBoundary } from './RingsideShowBoundary';
import { replicatedShowsTable } from '@/services/replication';
import { getSyncErrorMessage } from '@/services/replication/syncErrorUtils';
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

function renderBoundary(showId: string, queryClient = createTestQueryClient(), child?: ReactNode) {
  return render(boundaryRoutes(showId, child), { initialRoute: `/at-show/${showId}`, queryClient });
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
      boundaryRoutes('show-transition', <div data-testid="nested-scoresheet">Open scoresheet</div>)
    );

    expect(screen.getByTestId('nested-scoresheet')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading ringside…' })).not.toBeInTheDocument();
  });

  it('does not preserve a previous show while navigating between show IDs', async () => {
    vi.mocked(replicatedShowsTable.getShowById)
      .mockResolvedValueOnce({ id: 'show-first' } as never)
      .mockReturnValueOnce(new Promise(() => {}) as never);

    const { user } = renderBoundary(
      'show-first',
      createTestQueryClient(),
      <Link to="/at-show/show-second">Open another show</Link>
    );
    await user.click(await screen.findByRole('link', { name: 'Open another show' }));

    expect(screen.getByRole('status', { name: 'Loading ringside…' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open another show' })).not.toBeInTheDocument();
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

  /**
   * MYK9-205, the half PR #1687 left open.
   *
   * The sharp case is NOT a browser that knows it is offline — that path
   * already worked. It is venue Wi-Fi that associates but carries no traffic:
   * `navigator.onLine` is true, so the boundary tries to verify the local miss
   * against the server, the sync throws, and the generic error card takes over
   * before `MissingShowState` is ever reached. A judge is then offered exactly
   * one button, "Try Again", which cannot succeed, and the priming action that
   * would actually fix the device is nowhere on screen.
   */
  describe('when the device reports being online but the backend is unreachable', () => {
    beforeEach(() => {
      networkState.isOnline = true;
      authState.user = { id: 'judge-1', is_anonymous: false };
      authState.roles = [UserRole.JUDGE];
      vi.mocked(replicatedShowsTable.getShowById).mockResolvedValue(null as never);
      vi.mocked(replicatedShowsTable.sync).mockResolvedValue({
        success: false,
        // Production-shaped: the table throws `Supabase query failed: <cause>`
        // and getSyncErrorMessage sanitises it, destroying the browser marker.
        // A raw 'Failed to fetch' here would pass while production failed.
        error: getSyncErrorMessage(new Error('Supabase query failed: Failed to fetch')),
      } as never);
    });

    it('offers a judge the priming action instead of a dead-end error card', async () => {
      renderBoundary('show-unreachable');

      expect(await screen.findByText("This show isn't saved on this device")).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /load this show onto this device/i })
      ).toBeInTheDocument();
      expect(screen.queryByText('Oops! Something went wrong')).not.toBeInTheDocument();
      // The connectivity-specific arm, reached through the real sanitiser.
      expect(screen.getByText(/venue wi-fi/i)).toBeInTheDocument();
    });

    it('keeps a retry available, and an exit that is not the retry', async () => {
      renderBoundary('show-unreachable-actions');

      expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /back to dashboard/i })).toBeInTheDocument();
    });

    it('does not tell the user the show is missing', async () => {
      renderBoundary('show-unreachable-copy');

      await screen.findByText("This show isn't saved on this device");
      expect(screen.queryByText('Show not found')).not.toBeInTheDocument();
      // "Check your connection" is actively misleading here: the connection is
      // up, which is why the user got this far at all.
      expect(screen.queryByText(/check your connection/i)).not.toBeInTheDocument();
    });

    it('still withholds the priming action from a non-staff account', async () => {
      authState.roles = [UserRole.EXHIBITOR];
      renderBoundary('show-unreachable-exhibitor');

      expect(await screen.findByText("This show isn't saved on this device")).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /load this show onto this device/i })
      ).not.toBeInTheDocument();
    });

    it('does not blame the network when the failure was local storage', async () => {
      // Same `{ success: false }` shape, entirely different cause. Sending a
      // user with a full disk to go hunt for signal is a wrong diagnosis.
      vi.mocked(replicatedShowsTable.sync).mockResolvedValue({
        success: false,
        // No remote marker, so the sanitiser passes it through untouched.
        error: getSyncErrorMessage(new Error('QuotaExceededError: storage is full')),
      } as never);

      renderBoundary('show-quota');

      expect(await screen.findByText("This show isn't saved on this device")).toBeInTheDocument();
      expect(screen.queryByText(/venue wi-fi/i)).not.toBeInTheDocument();
      // Recovery is still reachable: the local-miss fact holds either way.
      expect(
        screen.getByRole('button', { name: /load this show onto this device/i })
      ).toBeInTheDocument();
    });

    it('recovers once the backend comes back, without a reload', async () => {
      renderBoundary('show-recovers');
      const retry = await screen.findByRole('button', { name: /try again/i });

      vi.mocked(replicatedShowsTable.getShowById).mockResolvedValue({
        id: 'show-recovers',
      } as never);
      vi.mocked(replicatedShowsTable.sync).mockResolvedValue({ success: true } as never);

      await act(async () => {
        retry.click();
      });

      expect(await screen.findByText(CHILD)).toBeInTheDocument();
    });
  });
});
