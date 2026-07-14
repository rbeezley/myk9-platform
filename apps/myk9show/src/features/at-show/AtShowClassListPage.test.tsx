/**
 * Integration test for the at-show ClassList (the navigation entry).
 *
 * Proves: classes render as cards from mocked replication; a Novice Section A/B
 * pair collapses into one card that routes to the COMBINED EntryList; a
 * standalone class routes to the SINGLE EntryList. (No ID typing — tap a card.)
 *
 * Also proves the per-trial collapse affordance: trial sections default open,
 * a header click collapses/expands its classes, and the collapsed set persists
 * per-show to localStorage (so a judge's focus on one ring survives reloads).
 */

import { Routes, Route, useNavigate } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@/test/utils/testUtils';
import { ReplicationSyncContext } from '@/context/ReplicationSyncContext';
import type { ReplicationSyncContextValue } from '@/context/ReplicationSyncContext';
import { UserRole, ScopeType, type UserWithRoles } from '@/types/auth-types';

vi.mock('@/services/replication', () => ({
  replicatedShowsTable: { getShowById: vi.fn() },
  replicatedTrialsTable: { getTrialsByShow: vi.fn() },
  replicatedClassesTable: { getClassesByTrial: vi.fn() },
  replicatedEntriesTable: { getEntriesByShow: vi.fn(), subscribe: vi.fn(() => vi.fn()) },
}));

// The "Back to Show Desk" affordance mirrors the show-desk route's admission,
// which is club-SCOPED for club admins. Drive `hasRole`/`userWithRoles` so we
// can prove a scoped club admin gets the shortcut while a cross-club admin does
// not (and is routed back to ringside rather than ejected to the public page).
const mockAuthState = vi.hoisted(() => ({
  hasRole: (_role: unknown): boolean => false,
  userWithRoles: null as UserWithRoles | null,
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => mockAuthState,
}));

import { AtShowClassListPage } from './AtShowClassListPage';
import {
  replicatedShowsTable,
  replicatedTrialsTable,
  replicatedClassesTable,
  replicatedEntriesTable,
} from '@/services/replication';

const NOVICE_A = {
  id: 'class-a',
  element: 'Container',
  level: 'Novice',
  section: 'A',
  classStatus: 'in_progress',
  classOrder: 2,
  judgeName: 'Judge J',
};
const NOVICE_B = { ...NOVICE_A, id: 'class-b', section: 'B', classOrder: 3 };
const INTERIOR_EXC = {
  id: 'class-c',
  element: 'Interior',
  level: 'Excellent',
  section: '-',
  classStatus: 'setup',
  classOrder: 1,
  judgeName: 'Judge K',
};
const BURIED_ADV = {
  id: 'class-e',
  element: 'Buried',
  level: 'Advanced',
  section: '-',
  classStatus: 'setup',
  classOrder: 4,
  judgeName: 'Judge M',
};
const EXTERIOR_MASTER = {
  id: 'class-d',
  element: 'Exterior',
  level: 'Master',
  section: '-',
  classStatus: 'setup',
  classOrder: 1,
  judgeName: 'Judge L',
};

// Distinct classes per trial so collapse assertions target one section only.
const CLASSES_BY_TRIAL: Record<string, unknown[]> = {
  'trial-1': [NOVICE_A, NOVICE_B, INTERIOR_EXC, BURIED_ADV],
  'trial-2': [EXTERIOR_MASTER],
};

function seed() {
  vi.mocked(replicatedShowsTable.getShowById).mockResolvedValue({
    name: 'Spring Trial',
    organization: 'AKC Scent Work',
  } as never);
  vi.mocked(replicatedTrialsTable.getTrialsByShow).mockResolvedValue([
    { id: 'trial-1', trialNumber: 1, date: '2026-06-01' },
    { id: 'trial-2', trialNumber: 2, date: '2026-06-02' },
  ] as never);
  vi.mocked(replicatedClassesTable.getClassesByTrial).mockImplementation(
    (async (trialId: string) => CLASSES_BY_TRIAL[trialId] ?? []) as never
  );
  vi.mocked(replicatedEntriesTable.getEntriesByShow).mockResolvedValue([] as never);
}

const settledSyncStatus: ReplicationSyncContextValue['status'] = {
  isSyncing: false,
  lastSyncAt: new Date('2026-06-01T12:00:00Z'),
  error: null,
  tablesStatus: {
    shows: 'success',
    trials: 'success',
    classes: 'success',
    entries: 'success',
  },
};

const renderPage = (syncStatus: ReplicationSyncContextValue['status'] = settledSyncStatus) =>
  render(
    <ReplicationSyncContext.Provider
      value={{ status: syncStatus, triggerSync: vi.fn(), syncTable: vi.fn() }}
    >
      <Routes>
        <Route path="/at-show/:showId" element={<AtShowClassListPage />} />
        <Route path="/at-show/:showId/class/:classId" element={<div>SINGLE PAGE</div>} />
        <Route
          path="/at-show/:showId/class/:classIdA/:classIdB"
          element={<div>COMBINED PAGE</div>}
        />
        <Route path="/at-show" element={<div>RINGSIDE HOME</div>} />
        <Route path="/shows/:showId/show-desk" element={<div>SHOW DESK</div>} />
      </Routes>
    </ReplicationSyncContext.Provider>,
    { initialRoute: '/at-show/show-1' }
  );

describe('AtShowClassListPage (Phase 1h class picker)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    seed();
    mockAuthState.hasRole = () => false;
    mockAuthState.userWithRoles = null;
  });

  it('renders class cards (Novice A/B collapsed into one, plus standalone)', async () => {
    renderPage();
    // The Novice A/B pair renders as a single card.
    expect(await screen.findByText(/Container Novice/)).toBeInTheDocument();
    expect(screen.getByText(/Interior Excellent/)).toBeInTheDocument();
  });

  it('shows syncing copy instead of a definitive empty state while first sync is pending', async () => {
    vi.mocked(replicatedTrialsTable.getTrialsByShow).mockResolvedValue([] as never);

    renderPage({
      ...settledSyncStatus,
      isSyncing: true,
      tablesStatus: { shows: 'success', trials: 'syncing', classes: 'idle', entries: 'idle' },
    });

    expect(
      await screen.findByRole('status', { name: 'Loading at-show classes' })
    ).toBeInTheDocument();
    expect(document.querySelector('.animate-spin')).toBeNull();
    expect(screen.queryByText('This show has no classes yet.')).not.toBeInTheDocument();
  });

  it('keeps a ringside-safe exit in the empty state', async () => {
    vi.mocked(replicatedTrialsTable.getTrialsByShow).mockResolvedValue([] as never);

    renderPage();

    expect(await screen.findByText('This show has no classes yet.')).toBeInTheDocument();
    expect(
      screen.queryByRole('status', { name: 'Loading at-show classes' })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Ringside' }));
    expect(await screen.findByText('RINGSIDE HOME')).toBeInTheDocument();
  });

  it('keeps a ringside-safe exit when class loading fails', async () => {
    vi.mocked(replicatedTrialsTable.getTrialsByShow).mockRejectedValue(new Error('Timed out'));

    renderPage();

    expect(await screen.findByText('Failed to load classes')).toBeInTheDocument();
    expect(
      screen.queryByRole('status', { name: 'Loading at-show classes' })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Ringside' }));
    expect(await screen.findByText('RINGSIDE HOME')).toBeInTheDocument();
  });

  it('offers Show Desk to a club admin scoped to this show', async () => {
    vi.mocked(replicatedShowsTable.getShowById).mockResolvedValue({
      name: 'Spring Trial',
      organization: 'AKC Scent Work',
      clubId: 'club-1',
    } as never);
    mockAuthState.hasRole = role => role === UserRole.CLUB_ADMIN;
    mockAuthState.userWithRoles = {
      scopes: [{ roleId: UserRole.CLUB_ADMIN, scopeType: ScopeType.CLUB, scopeId: 'club-1' }],
    } as UserWithRoles;

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Back to Show Desk' }));
    expect(await screen.findByText('SHOW DESK')).toBeInTheDocument();
  });

  it('keeps a club admin from ANOTHER club out of Show Desk (routes to ringside, no eject)', async () => {
    vi.mocked(replicatedShowsTable.getShowById).mockResolvedValue({
      name: 'Spring Trial',
      organization: 'AKC Scent Work',
      clubId: 'club-1',
    } as never);
    mockAuthState.hasRole = role => role === UserRole.CLUB_ADMIN;
    mockAuthState.userWithRoles = {
      scopes: [{ roleId: UserRole.CLUB_ADMIN, scopeType: ScopeType.CLUB, scopeId: 'club-OTHER' }],
    } as UserWithRoles;

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Back to Ringside' }));
    expect(await screen.findByText('RINGSIDE HOME')).toBeInTheDocument();
  });

  it('routes a Novice A/B card to the combined EntryList', async () => {
    renderPage();
    fireEvent.click(await screen.findByText(/Container Novice/));
    expect(await screen.findByText('COMBINED PAGE')).toBeInTheDocument();
  });

  it('routes a standalone class to the single EntryList', async () => {
    renderPage();
    fireEvent.click(await screen.findByText(/Interior Excellent/));
    expect(await screen.findByText('SINGLE PAGE')).toBeInTheDocument();
  });

  it('surfaces favorite and live classes before empty setup classes on phones', async () => {
    window.localStorage.setItem('favorites_show-1_trial-1', JSON.stringify(['class-e']));

    renderPage();

    const liveClass = await screen.findByText(/Container Novice/);
    const favoriteClass = screen.getByText(/Buried Advanced/);
    const emptySetupClass = screen.getByText(/Interior Excellent/);

    expect(liveClass.compareDocumentPosition(emptySetupClass)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(favoriteClass.compareDocumentPosition(emptySetupClass)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it('defaults every trial open and collapses one section without touching others', async () => {
    renderPage();
    // Both trials' classes are visible on first render.
    expect(await screen.findByText(/Container Novice/)).toBeInTheDocument();
    expect(screen.getByText(/Exterior Master/)).toBeInTheDocument();

    const trial2Header = screen.getByRole('button', { name: /Trial 2/ });
    expect(trial2Header).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(trial2Header);

    expect(screen.getByRole('button', { name: /Trial 2/ })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(screen.queryByText(/Exterior Master/)).not.toBeInTheDocument();
    // Sibling trial is unaffected.
    expect(screen.getByText(/Container Novice/)).toBeInTheDocument();
  });

  it('renders trial headers and count chips with outdoor-readable contrast tokens', async () => {
    renderPage();
    await screen.findByText(/Container Novice/);

    const trial2Header = screen.getByRole('button', { name: /Trial 2/ });
    expect(trial2Header).toHaveClass('text-foreground');
    expect(trial2Header).not.toHaveClass('text-muted-foreground');

    const countChip = trial2Header.querySelector('span.shrink-0.rounded-full');
    expect(countChip).toHaveClass('bg-[color:var(--chip-stone-bg)]');
    expect(countChip).toHaveClass('text-[color:var(--chip-stone-fg)]');
    expect(countChip).not.toHaveClass('text-muted-foreground');
  });

  it('re-expands a collapsed trial when its header is clicked again', async () => {
    renderPage();
    await screen.findByText(/Exterior Master/);

    fireEvent.click(screen.getByRole('button', { name: /Trial 2/ }));
    expect(screen.queryByText(/Exterior Master/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Trial 2/ }));
    expect(await screen.findByText(/Exterior Master/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Trial 2/ })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });

  it('persists collapsed trials per-show to localStorage', async () => {
    renderPage();
    await screen.findByText(/Exterior Master/);

    fireEvent.click(screen.getByRole('button', { name: /Trial 2/ }));

    const raw = window.localStorage.getItem('at-show-collapsed-trials:show-1');
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw as string)).toContain('trial-2');
  });

  it('restores collapsed trials from localStorage on mount', async () => {
    window.localStorage.setItem('at-show-collapsed-trials:show-1', JSON.stringify(['trial-2']));

    renderPage();

    // Trial 1 is expanded; trial 2 starts collapsed from persisted state.
    expect(await screen.findByText(/Container Novice/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Trial 2/ })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(screen.queryByText(/Exterior Master/)).not.toBeInTheDocument();
  });

  it('re-syncs collapsed state when the show changes without a remount', async () => {
    // show-1 has trial-2 collapsed; show-2 has nothing collapsed.
    window.localStorage.setItem('at-show-collapsed-trials:show-1', JSON.stringify(['trial-2']));

    const ShowSwitcher = () => {
      const navigate = useNavigate();
      return (
        <button type="button" onClick={() => navigate('/at-show/show-2')}>
          switch-show
        </button>
      );
    };

    render(
      <ReplicationSyncContext.Provider
        value={{ status: settledSyncStatus, triggerSync: vi.fn(), syncTable: vi.fn() }}
      >
        <ShowSwitcher />
        <Routes>
          <Route path="/at-show/:showId" element={<AtShowClassListPage />} />
        </Routes>
      </ReplicationSyncContext.Provider>,
      { initialRoute: '/at-show/show-1' }
    );

    // show-1: trial 2 collapsed from persisted state.
    expect(await screen.findByText(/Container Novice/)).toBeInTheDocument();
    expect(screen.queryByText(/Exterior Master/)).not.toBeInTheDocument();

    // Same route, new :showId — the component instance is reused (no remount).
    fireEvent.click(screen.getByRole('button', { name: 'switch-show' }));

    // show-2 has no collapsed state, so trial 2 must NOT inherit show-1's collapse.
    expect(await screen.findByText(/Exterior Master/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Trial 2/ })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    // show-1's persisted state is untouched (no cross-show bleed).
    expect(
      JSON.parse(window.localStorage.getItem('at-show-collapsed-trials:show-1') as string)
    ).toContain('trial-2');
  });
});
