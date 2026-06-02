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

import { Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@/test/utils/testUtils';

vi.mock('@/services/replication', () => ({
  replicatedShowsTable: { getShowById: vi.fn() },
  replicatedTrialsTable: { getTrialsByShow: vi.fn() },
  replicatedClassesTable: { getClassesByTrial: vi.fn() },
  replicatedEntriesTable: { getEntriesByShow: vi.fn() },
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
  'trial-1': [NOVICE_A, NOVICE_B, INTERIOR_EXC],
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

const renderPage = () =>
  render(
    <Routes>
      <Route path="/at-show/:showId" element={<AtShowClassListPage />} />
      <Route path="/at-show/:showId/class/:classId" element={<div>SINGLE PAGE</div>} />
      <Route path="/at-show/:showId/class/:classIdA/:classIdB" element={<div>COMBINED PAGE</div>} />
    </Routes>,
    { initialRoute: '/at-show/show-1' }
  );

describe('AtShowClassListPage (Phase 1h class picker)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
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
});
