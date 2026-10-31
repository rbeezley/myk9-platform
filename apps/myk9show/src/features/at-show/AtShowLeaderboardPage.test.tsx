import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import type { NationalsLeaderboardInputRow } from './leaderboard/nationalsLeaderboardInputs';

const mocks = vi.hoisted(() => ({
  role: 'judge' as string | null,
  show: { isNationals: true } as { isNationals: boolean } | null,
  showFails: false,
  online: true,
  rows: null as NationalsLeaderboardInputRow[] | null,
  isError: false,
  liveDown: false,
  enabledArgs: [] as boolean[],
  retry: vi.fn(),
}));

vi.mock('./useRingsideEffectiveRole', () => ({
  useRingsideEffectiveRole: () => ({ ringsideRole: mocks.role }),
}));
vi.mock('./useRehydrateRingsideGrant', () => ({ useRehydrateRingsideGrant: () => null }));
vi.mock('@/lib/networkUtils', () => ({ useOnlineStatus: () => mocks.online }));
vi.mock('@/services/replication', () => ({
  replicatedShowsTable: {
    getShowById: vi.fn(async () => {
      if (mocks.showFails) throw new Error('replica read failed');
      return mocks.show;
    }),
  },
}));
vi.mock('./leaderboard/useNationalsLeaderboardInputs', async () => {
  const actual = await vi.importActual<typeof import('./leaderboard/nationalsLeaderboardInputs')>(
    './leaderboard/nationalsLeaderboardInputs'
  );
  return {
    useNationalsLeaderboardInputs: (_showId: string, enabled: boolean) => {
      mocks.enabledArgs.push(enabled);
      return {
        inputs: mocks.rows ? actual.toLeaderboardInputs(mocks.rows) : null,
        isLoading: false,
        isError: mocks.isError,
        liveDown: mocks.liveDown,
        retry: mocks.retry,
      };
    },
  };
});

import AtShowLeaderboardPage from './AtShowLeaderboardPage';
import { useRingsideReturnStore } from './menu/ringsideReturnStore';

function row(over: Partial<NationalsLeaderboardInputRow>): NationalsLeaderboardInputRow {
  return {
    entry_id: 'e1',
    class_id: 'c1',
    dog_id: 'd1',
    dog_name: 'Alpha Registered',
    dog_call_name: 'Alpha',
    armband: '101',
    handler_name: 'Hannah Handler',
    entry_status: 'confirmed',
    check_in_status: null,
    is_scored: true,
    result_status: 'qualified',
    points_earned: 10,
    search_time_seconds: 30.5,
    class_results_released_at: '2026-11-01T12:00:00Z',
    trial_date: '2026-11-01',
    show_start_date: '2026-11-01',
    ...over,
  };
}

function renderPage() {
  return render(
    <Routes>
      <Route path="/at-show/:showId" element={<div>class picker</div>} />
      <Route path="/at-show/:showId/leaderboard" element={<AtShowLeaderboardPage />} />
    </Routes>,
    { initialRoute: '/at-show/show-1/leaderboard' }
  );
}

beforeEach(() => {
  mocks.role = 'judge';
  mocks.show = { isNationals: true };
  mocks.showFails = false;
  mocks.online = true;
  mocks.isError = false;
  mocks.liveDown = false;
  mocks.enabledArgs = [];
  mocks.retry.mockReset();
  mocks.rows = [
    row({}),
    row({
      entry_id: 'e2',
      class_id: 'c2',
      dog_id: 'd2',
      dog_name: 'Bravo Registered',
      dog_call_name: 'Bravo',
      armband: '102',
      points_earned: 25,
    }),
  ];
  useRingsideReturnStore.getState().clear();
});

describe('AtShowLeaderboardPage', () => {
  it.each(['judge', 'steward', 'admin'])('ranks the field for a %s', async role => {
    mocks.role = role;
    renderPage();
    expect(
      await screen.findByRole('heading', { name: 'Nationals Leaderboard' })
    ).toBeInTheDocument();
    const cells = screen.getAllByRole('row').map(r => r.textContent ?? '');
    // Bravo (25) ranks above Alpha (10): the board is built from the server's complete rows.
    expect(cells[1]).toContain('Bravo');
    expect(cells[2]).toContain('Alpha');
  });

  it('counts only released classes: an unreleased score never ranks', async () => {
    mocks.rows = [
      row({}),
      row({
        entry_id: 'e2',
        class_id: 'c2',
        dog_id: 'd2',
        dog_name: 'Bravo Registered',
        dog_call_name: 'Bravo',
        class_results_released_at: null,
        is_scored: false,
        result_status: null,
        points_earned: null,
        search_time_seconds: null,
      }),
    ];
    renderPage();
    await screen.findByRole('heading', { name: 'Nationals Leaderboard' });
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.queryByText('Bravo')).not.toBeInTheDocument();
  });

  it('sends an exhibitor to the class picker and reads nothing for them', async () => {
    mocks.role = 'exhibitor';
    renderPage();
    expect(await screen.findByText('class picker')).toBeInTheDocument();
    expect(mocks.enabledArgs.every(enabled => enabled === false)).toBe(true);
  });

  it('sends an unresolved role to the class picker', async () => {
    mocks.role = null;
    renderPage();
    expect(await screen.findByText('class picker')).toBeInTheDocument();
  });

  it('sends staff on a non-nationals show to the class picker', async () => {
    mocks.show = { isNationals: false };
    renderPage();
    expect(await screen.findByText('class picker')).toBeInTheDocument();
  });

  it('shows "needs a connection" offline instead of a partial board', async () => {
    mocks.online = false;
    mocks.rows = null;
    renderPage();
    expect(await screen.findByText('Needs a connection')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Nationals Leaderboard' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to ringside/i })).toBeInTheDocument();
    expect(mocks.enabledArgs.every(enabled => enabled === false)).toBe(true);
  });

  it('does not show cached rankings as live once the device goes offline', async () => {
    mocks.online = false;
    // The hook still holds rows from an earlier load.
    renderPage();
    expect(await screen.findByText('Needs a connection')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Nationals Leaderboard' })
    ).not.toBeInTheDocument();
  });

  it('says live updates are paused instead of leaving the board silently stale', async () => {
    mocks.liveDown = true;
    renderPage();
    expect(await screen.findByText('Live updates paused')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Nationals Leaderboard' })).toBeInTheDocument();
  });

  it.each([
    ['fails', true, { isNationals: true }],
    ['has no row', false, null],
  ])('explains a show lookup that %s, with retry and the way back', async (_label, fails, show) => {
    mocks.rows = null;
    mocks.showFails = fails;
    mocks.show = show;
    renderPage();
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to ringside/i })).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Nationals Leaderboard' })
    ).not.toBeInTheDocument();
  });

  it('keeps the ringside return link when the read fails', async () => {
    mocks.rows = null;
    mocks.isError = true;
    renderPage();
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to ringside/i })).toHaveAttribute(
      'href',
      '/at-show/show-1'
    );
  });

  it('returns to the ringside screen the menu was opened from', async () => {
    useRingsideReturnStore.getState().set({
      returnTo: '/at-show/show-1?view=ring',
      scope: '/at-show/show-1/leaderboard',
    });
    renderPage();
    expect(await screen.findByRole('link', { name: /back to ringside/i })).toHaveAttribute(
      'href',
      '/at-show/show-1?view=ring'
    );
  });
});
