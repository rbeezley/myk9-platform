/**
 * Integration test for the combined Novice Section A/B entry list.
 *
 * Exercises the combined shim end-to-end against mocked replication:
 * fetchCombinedClasses merges A + B entries, both render under "All Sections",
 * and the section-filter tabs narrow to only A / only B. Section comes from
 * each entry's class row (A's class.section = 'A', B's = 'B').
 */

import { Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@/test/utils/testUtils';
import { AtShowCombinedEntryListPage } from './AtShowCombinedEntryListPage';

vi.mock('@/services/replication', () => ({
  replicatedShowsTable: { getShowById: vi.fn() },
  replicatedClassesTable: { getClassById: vi.fn(), sync: vi.fn(), updateClass: vi.fn() },
  replicatedEntriesTable: { getEntriesByClass: vi.fn(), sync: vi.fn(), updateEntry: vi.fn() },
  replicatedTrialsTable: { getTrialById: vi.fn() },
}));

vi.mock('@/hooks/useAuthContext', async importOriginal => {
  const actual = await importOriginal<typeof import('@/hooks/useAuthContext')>();
  const { UserRole } = await import('@/types/auth-types');
  return {
    ...actual,
    useAuthContext: () => ({ getUserRoles: () => [UserRole.SITE_ADMIN] }),
  };
});

import {
  replicatedShowsTable,
  replicatedClassesTable,
  replicatedEntriesTable,
  replicatedTrialsTable,
} from '@/services/replication';

const CLASS_A = {
  id: 'class-a',
  element: 'Container',
  level: 'Novice',
  section: 'A',
  classStatus: 'in_progress',
  trialId: 'trial-1',
  judgeName: 'Judge Judy',
};
const CLASS_B = { ...CLASS_A, id: 'class-b', section: 'B' };

const ENTRY_A = {
  id: 'a1',
  classId: 'class-a',
  armband: 105,
  dogCallName: 'Rex',
  dogBreed: 'Australian Shepherd',
  handler: 'Jane',
  isScored: false,
  checkInStatus: 'no-status',
};
const ENTRY_B = {
  id: 'b1',
  classId: 'class-b',
  armband: 206,
  dogCallName: 'Bella',
  dogBreed: 'Border Collie',
  handler: 'Sam',
  isScored: false,
  checkInStatus: 'no-status',
};

function seed() {
  vi.mocked(replicatedShowsTable.getShowById).mockResolvedValue({
    name: 'Spring Trial',
    organization: 'AKC Scent Work',
    startDate: '2026-06-01',
  } as never);
  vi.mocked(replicatedClassesTable.getClassById).mockImplementation(
    async (id: string) => (id === 'class-a' ? CLASS_A : id === 'class-b' ? CLASS_B : null) as never
  );
  vi.mocked(replicatedEntriesTable.getEntriesByClass).mockImplementation(
    async (id: string) => (id === 'class-a' ? [ENTRY_A] : id === 'class-b' ? [ENTRY_B] : []) as never
  );
  vi.mocked(replicatedTrialsTable.getTrialById).mockResolvedValue({
    id: 'trial-1',
    trialNumber: 1,
    date: '2026-06-01',
  } as never);
  vi.mocked(replicatedEntriesTable.updateEntry).mockResolvedValue('a1');
}

const renderPage = () =>
  render(
    <Routes>
      <Route
        path="/at-show/:showId/class/:classIdA/:classIdB"
        element={<AtShowCombinedEntryListPage />}
      />
    </Routes>,
    { initialRoute: '/at-show/show-1/class/class-a/class-b' }
  );

describe('AtShowCombinedEntryListPage (Phase 1h combined Section A/B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seed();
  });

  it('renders merged A + B entries under All Sections', async () => {
    renderPage();
    expect(await screen.findByText('Rex')).toBeInTheDocument();
    expect(screen.getByText('Bella')).toBeInTheDocument();
  });

  it('filters to only Section A when the Section A tab is selected', async () => {
    renderPage();
    await screen.findByText('Rex');

    fireEvent.click(screen.getByText('Section A'));

    await waitFor(() => expect(screen.queryByText('Bella')).not.toBeInTheDocument());
    expect(screen.getByText('Rex')).toBeInTheDocument();
  });

  it('filters to only Section B when the Section B tab is selected', async () => {
    renderPage();
    await screen.findByText('Bella');

    fireEvent.click(screen.getByText('Section B'));

    await waitFor(() => expect(screen.queryByText('Rex')).not.toBeInTheDocument());
    expect(screen.getByText('Bella')).toBeInTheDocument();
  });
});
