/**
 * Integration test for the at-show ClassList (the navigation entry).
 *
 * Proves: classes render as cards from mocked replication; a Novice Section A/B
 * pair collapses into one card that routes to the COMBINED EntryList; a
 * standalone class routes to the SINGLE EntryList. (No ID typing — tap a card.)
 */

import { Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@/test/utils/testUtils';

vi.mock('@/services/replication', () => ({
  replicatedShowsTable: { getShowById: vi.fn() },
  replicatedTrialsTable: { getTrialsByShow: vi.fn() },
  replicatedClassesTable: { getClassesByTrial: vi.fn() },
  replicatedEntriesTable: { getEntriesByClass: vi.fn() },
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
  classOrder: 1,
  judgeName: 'Judge J',
};
const NOVICE_B = { ...NOVICE_A, id: 'class-b', section: 'B', classOrder: 2 };
const INTERIOR_EXC = {
  id: 'class-c',
  element: 'Interior',
  level: 'Excellent',
  section: '-',
  classStatus: 'setup',
  classOrder: 3,
  judgeName: 'Judge K',
};

function seed() {
  vi.mocked(replicatedShowsTable.getShowById).mockResolvedValue({
    name: 'Spring Trial',
    organization: 'AKC Scent Work',
  } as never);
  vi.mocked(replicatedTrialsTable.getTrialsByShow).mockResolvedValue([
    { id: 'trial-1', trialNumber: 1, date: '2026-06-01' },
  ] as never);
  vi.mocked(replicatedClassesTable.getClassesByTrial).mockResolvedValue([
    NOVICE_A,
    NOVICE_B,
    INTERIOR_EXC,
  ] as never);
  vi.mocked(replicatedEntriesTable.getEntriesByClass).mockResolvedValue([] as never);
}

const renderPage = () =>
  render(
    <Routes>
      <Route path="/at-show/:showId" element={<AtShowClassListPage />} />
      <Route path="/at-show/:showId/class/:classId" element={<div>SINGLE PAGE</div>} />
      <Route
        path="/at-show/:showId/class/:classIdA/:classIdB"
        element={<div>COMBINED PAGE</div>}
      />
    </Routes>,
    { initialRoute: '/at-show/show-1' }
  );

describe('AtShowClassListPage (Phase 1h class picker)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seed();
  });

  it('renders class cards (Novice A/B collapsed into one, plus standalone)', async () => {
    renderPage();
    // The Novice A/B pair renders as a single card.
    expect(await screen.findByText(/Container Novice/)).toBeInTheDocument();
    expect(screen.getByText(/Interior Excellent/)).toBeInTheDocument();
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
});
