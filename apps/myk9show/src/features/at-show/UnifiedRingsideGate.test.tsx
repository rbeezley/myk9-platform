/**
 * Tests for UnifiedRingsideGate — the per-show `/at-show` enablement gate.
 *
 * Verifies the four branches: loading spinner, enabled (renders children),
 * disabled / missing show (inline notice, never a 404), and the DEV escape
 * hatch (renders children without hitting the DB).
 */

import { Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
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

function renderGate(showId: string) {
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
    { initialRoute: `/at-show/${showId}` }
  );
}

describe('UnifiedRingsideGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('dev override renders children without fetching the show flag', () => {
    vi.mocked(isUnifiedRingsideDevOverride).mockReturnValue(true);
    renderGate('show-dev');
    expect(screen.getByText(CHILD)).toBeInTheDocument();
    expect(replicatedShowsTable.getShowById).not.toHaveBeenCalled();
  });
});
