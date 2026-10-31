import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';

const mocks = vi.hoisted(() => ({
  role: 'judge' as string | null,
  isNationals: true as boolean | null,
  readState: 'ready' as string,
  dataShowIds: [] as string[],
}));

vi.mock('./useRingsideEffectiveRole', () => ({
  useRingsideEffectiveRole: () => ({ ringsideRole: mocks.role }),
}));
vi.mock('./useRehydrateRingsideGrant', () => ({ useRehydrateRingsideGrant: () => null }));
vi.mock('@/features/results-tab/useResultsTabData', () => ({
  useResultsTabData: (showId: string) => {
    mocks.dataShowIds.push(showId);
    return {
      rows: [],
      entries: [],
      showStartDate: '2026-11-01',
      isNationals: mocks.isNationals,
      rankingKeyState: mocks.isNationals === null ? 'loading' : 'ready',
      readState: mocks.readState,
      retry: vi.fn(),
      refreshFailed: false,
    };
  },
}));

import AtShowLeaderboardPage from './AtShowLeaderboardPage';
import { useRingsideReturnStore } from './menu/ringsideReturnStore';

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
  mocks.isNationals = true;
  mocks.readState = 'ready';
  mocks.dataShowIds = [];
  useRingsideReturnStore.getState().clear();
});

describe('AtShowLeaderboardPage', () => {
  it.each(['judge', 'steward', 'admin'])('opens the leaderboard for a %s', role => {
    mocks.role = role;
    renderPage();
    expect(screen.getByRole('heading', { name: 'Nationals Leaderboard' })).toBeInTheDocument();
  });

  it('sends an exhibitor to the class picker and reads nothing for them', () => {
    mocks.role = 'exhibitor';
    renderPage();
    expect(screen.getByText('class picker')).toBeInTheDocument();
    expect(mocks.dataShowIds.every(id => id === '')).toBe(true);
  });

  it('sends an unresolved role to the class picker', () => {
    mocks.role = null;
    renderPage();
    expect(screen.getByText('class picker')).toBeInTheDocument();
  });

  it('sends staff on a non-nationals show to the class picker', () => {
    mocks.isNationals = false;
    renderPage();
    expect(screen.getByText('class picker')).toBeInTheDocument();
  });

  it('waits on the nationals flag instead of guessing', () => {
    mocks.isNationals = null;
    renderPage();
    expect(screen.queryByText('class picker')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Nationals Leaderboard' })
    ).not.toBeInTheDocument();
  });

  it('keeps the ringside return link when the read fails', () => {
    mocks.readState = 'failed';
    renderPage();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to ringside/i })).toHaveAttribute(
      'href',
      '/at-show/show-1'
    );
  });

  it('returns to the ringside screen the menu was opened from', () => {
    useRingsideReturnStore.getState().set({
      returnTo: '/at-show/show-1?view=ring',
      scope: '/at-show/show-1/leaderboard',
    });
    renderPage();
    expect(screen.getByRole('link', { name: /back to ringside/i })).toHaveAttribute(
      'href',
      '/at-show/show-1?view=ring'
    );
  });
});
