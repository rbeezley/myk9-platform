import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { render, screen } from '@/test/utils/testUtils';
import type { SecretaryEntry } from '@/services/database/entries';
import AtShowNationalsLeaderboardPage from './AtShowNationalsLeaderboardPage';
import { useRingsideReturnStore } from './menu/ringsideReturnStore';

const entry = (armband: string, classId: string, points: number) =>
  ({
    id: `e-${armband}`,
    class_id: classId,
    armband,
    entry_status: 'confirmed',
    is_scored: true,
    result_status: 'qualified',
    points_earned: points,
    search_time_seconds: 60,
    dog: { id: `d-${armband}`, name: `Dog ${armband}`, call_name: null },
    handler_identity: { source: 'entered', name: `Handler ${armband}` },
  }) as unknown as SecretaryEntry;

const hook = vi.hoisted(() => ({
  isNationals: true as boolean | null,
  rankingKeyState: 'ready' as 'ready' | 'loading' | 'unavailable',
  readState: 'ready' as string,
  entries: [] as unknown[],
  rows: [] as unknown[],
}));
vi.mock('@/features/results-tab/useResultsTabData', () => ({
  useResultsTabData: () => ({
    rows: hook.rows,
    entries: hook.entries,
    showStartDate: '2026-10-10',
    isNationals: hook.isNationals,
    rankingKeyState: hook.rankingKeyState,
    readState: hook.readState,
    refreshFailed: false,
    retry: vi.fn(),
  }),
}));

const access = vi.hoisted(() => ({ staff: true }));
vi.mock('./useHasRingsideStaffAccess', () => ({ useHasRingsideStaffAccess: () => access.staff }));

function mount() {
  return render(
    <Routes>
      <Route path="/at-show/:showId/leaderboard" element={<AtShowNationalsLeaderboardPage />} />
      <Route path="/at-show/:showId" element={<div>RINGSIDE HOME</div>} />
    </Routes>,
    { initialRoute: '/at-show/show-1/leaderboard' }
  );
}

beforeEach(() => {
  access.staff = true;
  hook.isNationals = true;
  hook.rankingKeyState = 'ready';
  hook.readState = 'ready';
  useRingsideReturnStore.getState().clear();
  hook.rows = [
    { id: 'c1', trialId: 't1', trialDate: '2026-10-10', releasedAt: '2026-10-10T16:00:00Z' },
    { id: 'c-hidden', trialId: 't1', trialDate: '2026-10-10', releasedAt: null },
  ];
  hook.entries = [entry('7', 'c1', 20), entry('9', 'c-hidden', 99)];
});

describe('AtShowNationalsLeaderboardPage (MYK9-1540)', () => {
  it('ranks released classes only', () => {
    mount();
    expect(screen.getByRole('heading', { name: 'Nationals Leaderboard' })).toBeInTheDocument();
    expect(screen.getByText('Dog 7')).toBeInTheDocument();
    expect(screen.queryByText('Dog 9')).not.toBeInTheDocument();
  });

  it('sends an exhibitor who is not ringside staff back to ringside (result privacy)', () => {
    access.staff = false;
    mount();
    expect(screen.getByText('RINGSIDE HOME')).toBeInTheDocument();
    expect(screen.queryByText('Dog 7')).not.toBeInTheDocument();
  });

  it('sends a non-nationals show back to the ringside class list', () => {
    hook.isNationals = false;
    mount();
    expect(screen.getByText('RINGSIDE HOME')).toBeInTheDocument();
  });

  it('does not guess while the nationals flag is loading', () => {
    hook.isNationals = null;
    hook.rankingKeyState = 'loading';
    mount();
    expect(screen.queryByText('RINGSIDE HOME')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Nationals Leaderboard' })
    ).not.toBeInTheDocument();
  });

  it('returns to the ringside screen the menu was opened from', () => {
    useRingsideReturnStore.getState().set({
      returnTo: '/at-show/show-1?ring=2',
      scope: '/at-show/show-1/leaderboard',
    });
    mount();
    expect(screen.getByRole('link', { name: /Back to ringside/ })).toHaveAttribute(
      'href',
      '/at-show/show-1?ring=2'
    );
  });
});
