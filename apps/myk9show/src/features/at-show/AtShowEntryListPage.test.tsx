/**
 * Integration test for the Phase 1a `/at-show` ringside mount.
 *
 * Exercises the full shim wiring end-to-end against a mocked replication
 * layer: data adapter → useEntryListData → filters → ringside EntryListPage
 * render, and the card-click path → handlers → actions → the real
 * `replicatedEntriesTable.updateEntry(...)` write. Assertion-first on the
 * value-sensitive bit (the in-ring enum lands in BOTH the camel + snake
 * check-in columns), per CLAUDE.md.
 *
 * Also pins Phase 1d: `AtShowRoutes()` now registers its routes unconditionally
 * (per-show enablement moved into `UnifiedRingsideGate`, tested separately).
 */

import { Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@/test/utils/testUtils';
import { AtShowEntryListPage } from './AtShowEntryListPage';
import { AtShowRoutes } from '@/routes/atShowRoutes';
import {
  replicatedShowsTable,
  replicatedClassesTable,
  replicatedEntriesTable,
  replicatedTrialsTable,
} from '@/services/replication';

// Replication is the single host singleton the shim + adapters + actions all
// reach for. Mock the whole module so every table is a vi.fn() bag.
vi.mock('@/services/replication', () => ({
  replicatedShowsTable: { getShowById: vi.fn() },
  replicatedClassesTable: { getClassById: vi.fn(), sync: vi.fn(), updateClass: vi.fn() },
  replicatedEntriesTable: { getEntriesByClass: vi.fn(), sync: vi.fn(), updateEntry: vi.fn() },
  replicatedTrialsTable: { getTrialById: vi.fn() },
}));

// Auth: force a SITE_ADMIN primary role (→ ringside 'admin', canScore = true)
// so the pending card is clickable. Real getPrimaryRole is preserved so the
// role→permission mapping under test stays genuine.
vi.mock('@/hooks/useAuthContext', async importOriginal => {
  const actual = await importOriginal<typeof import('@/hooks/useAuthContext')>();
  const { UserRole } = await import('@/types/auth-types');
  return {
    ...actual,
    useAuthContext: () => ({ getUserRoles: () => [UserRole.SITE_ADMIN] }),
  };
});

const PENDING_ENTRY = {
  id: 'entry-1',
  classId: 'class-1',
  armband: 5,
  dogCallName: 'Rex',
  dogBreed: 'Border Collie',
  handler: 'Jane Handler',
  isScored: false,
  checkInStatus: 'no-status',
};

function seedReplication() {
  vi.mocked(replicatedShowsTable.getShowById).mockResolvedValue({
    name: 'Spring Trial',
    organization: 'AKC Scent Work',
    startDate: '2026-06-01',
  } as never);
  vi.mocked(replicatedClassesTable.getClassById).mockResolvedValue({
    id: 'class-1',
    element: 'Container',
    level: 'Novice',
    section: '-',
    classStatus: 'pending',
    trialId: 'trial-1',
    judgeName: 'Judge Judy',
  } as never);
  vi.mocked(replicatedTrialsTable.getTrialById).mockResolvedValue({
    id: 'trial-1',
    trialNumber: 1,
    date: '2026-06-01',
  } as never);
  vi.mocked(replicatedEntriesTable.getEntriesByClass).mockResolvedValue([PENDING_ENTRY] as never);
  vi.mocked(replicatedEntriesTable.updateEntry).mockResolvedValue('entry-1');
}

const renderPage = () =>
  render(
    <Routes>
      <Route path="/at-show/:showId/class/:classId" element={<AtShowEntryListPage />} />
    </Routes>,
    { initialRoute: '/at-show/show-1/class/class-1' }
  );

describe('AtShowEntryListPage (Phase 1a shim)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    seedReplication();
  });

  it('renders the ringside entry list from the mocked replication layer', async () => {
    renderPage();
    expect(await screen.findByText('Rex')).toBeInTheDocument();
    expect(screen.getByText('Border Collie')).toBeInTheDocument();
    expect(screen.getByText('Jane Handler')).toBeInTheDocument();
  });

  it('writes the in-ring check-in status to BOTH columns when a pending card is tapped', async () => {
    renderPage();
    const card = await screen.findByText('Rex');

    fireEvent.click(card);

    await waitFor(() =>
      expect(replicatedEntriesTable.updateEntry).toHaveBeenCalledWith('entry-1', {
        checkInStatus: 'in-ring',
        check_in_status: 'in-ring',
      })
    );
  });

  it('favorites a dog by armband without opening the scoresheet flow', async () => {
    renderPage();
    const favoriteButton = await screen.findByRole('button', { name: 'Favorite Rex' });

    fireEvent.click(favoriteButton);

    expect(JSON.parse(localStorage.getItem('dog_favorites_show-1') ?? '[]')).toEqual([5]);
    expect(replicatedEntriesTable.updateEntry).not.toHaveBeenCalled();
  });

  it('registers the /at-show routes unconditionally (per-show gating moved to UnifiedRingsideGate)', () => {
    // Phase 1d: route registration no longer depends on a global flag; the
    // per-show enablement check lives in UnifiedRingsideGate (tested in
    // UnifiedRingsideGate.test.tsx).
    expect(AtShowRoutes()).not.toBeNull();
  });
});
