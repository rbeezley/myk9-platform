/**
 * Tests for UnifiedRingsideGate — the per-show `/at-show` enablement gate.
 *
 * Verifies the four branches: loading spinner, enabled (renders children),
 * disabled / missing show (inline notice, never a 404), and the DEV escape
 * hatch (renders children without hitting the DB).
 */

import { Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestQueryClient, render, screen, act } from '@/test/utils/testUtils';
import { UnifiedRingsideGate } from './UnifiedRingsideGate';
import { isUnifiedRingsideDevOverride } from './atShowFeatureFlag';
import { replicatedShowsTable } from '@/services/replication';

vi.mock('@/services/replication', () => ({
  replicatedShowsTable: { getShowById: vi.fn() },
}));

// Keep the pure resolver real; control only the dev escape hatch per test.
vi.mock('./atShowFeatureFlag', async importOriginal => {
  const actual = await importOriginal<typeof import('./atShowFeatureFlag')>();
  return { ...actual, isUnifiedRingsideDevOverride: vi.fn(() => false) };
});

const CHILD = 'RINGSIDE CONTENT';

function renderGate(showId: string, queryClient = createTestQueryClient()) {
  return render(
    <Routes>
      <Route
        path="/at-show/:showId"
        element={
          <UnifiedRingsideGate>
            <div>{CHILD}</div>
          </UnifiedRingsideGate>
        }
      />
    </Routes>,
    { initialRoute: `/at-show/${showId}`, queryClient }
  );
}

describe('UnifiedRingsideGate', () => {
  beforeEach(() => {
    vi.mocked(replicatedShowsTable.getShowById).mockReset();
    vi.mocked(isUnifiedRingsideDevOverride).mockReset();
    vi.mocked(isUnifiedRingsideDevOverride).mockReturnValue(false);
  });

  it('shows a loading state while the show flag is being fetched', () => {
    // Never-resolving promise keeps the query in its loading state.
    vi.mocked(replicatedShowsTable.getShowById).mockReturnValue(new Promise(() => {}) as never);
    renderGate('show-loading');
    expect(screen.getByText('Loading ringside…')).toBeInTheDocument();
    expect(screen.queryByText(CHILD)).not.toBeInTheDocument();
  });

  it('renders children when the show has unified ringside enabled', async () => {
    vi.mocked(replicatedShowsTable.getShowById).mockResolvedValue({
      id: 'show-on',
      unifiedRingsideEnabled: true,
    } as never);
    renderGate('show-on');
    expect(await screen.findByText(CHILD)).toBeInTheDocument();
  });

  it('renders the inline notice (not a 404) when the show has ringside disabled', async () => {
    vi.mocked(replicatedShowsTable.getShowById).mockResolvedValue({
      id: 'show-off',
      unifiedRingsideEnabled: false,
    } as never);
    renderGate('show-off');
    expect(await screen.findByText("Ringside isn't enabled for this show")).toBeInTheDocument();
    expect(screen.queryByText(CHILD)).not.toBeInTheDocument();
  });

  it('renders the inline notice when the show is missing', async () => {
    vi.mocked(replicatedShowsTable.getShowById).mockResolvedValue(null as never);
    renderGate('show-missing');
    expect(await screen.findByText("Ringside isn't enabled for this show")).toBeInTheDocument();
  });

  it('refetches after show replication sync invalidates the shows cache', async () => {
    const queryClient = createTestQueryClient();
    vi.mocked(replicatedShowsTable.getShowById)
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce({
        id: 'show-after-sync',
        unifiedRingsideEnabled: true,
      } as never);

    renderGate('show-after-sync', queryClient);
    expect(await screen.findByText("Ringside isn't enabled for this show")).toBeInTheDocument();

    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['shows'] });
    });

    expect(await screen.findByText(CHILD)).toBeInTheDocument();
    expect(replicatedShowsTable.getShowById).toHaveBeenCalledTimes(2);
  });

  it('renders an error state (not the disabled notice) when the fetch fails', async () => {
    vi.mocked(replicatedShowsTable.getShowById).mockRejectedValue(new Error('network down'));
    renderGate('show-error');
    expect(await screen.findByText('Oops! Something went wrong')).toBeInTheDocument();
    expect(screen.queryByText("Ringside isn't enabled for this show")).not.toBeInTheDocument();
    expect(screen.queryByText(CHILD)).not.toBeInTheDocument();
  });

  it('dev override renders children without fetching the show flag', () => {
    vi.mocked(isUnifiedRingsideDevOverride).mockReturnValue(true);
    renderGate('show-dev');
    expect(screen.getByText(CHILD)).toBeInTheDocument();
    expect(replicatedShowsTable.getShowById).not.toHaveBeenCalled();
  });
});
