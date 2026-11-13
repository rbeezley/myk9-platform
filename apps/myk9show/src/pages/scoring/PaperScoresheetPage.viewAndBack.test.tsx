import { Routes, Route, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@/test/utils/testUtils';
import {
  getCockpitPaperScoringHref,
  getShowHomeHref,
} from '@/features/show-map/cockpit/cockpitRoutes';
import type { ScoringEntry } from './types';

/**
 * MYK9-1906: the List / Card choice is remembered and an explicit `mode` in the URL still wins.
 * MYK9-1907: "Back to Class" returns to the Show Desk the page was opened from, and keeps
 * `returnTo` when the view toggle rewrites the query string.
 */
const rows = vi.hoisted(() => ({ list: [] as unknown[] }));

vi.mock('./useScoringBreadcrumb', () => ({
  useScoringBreadcrumb: () => ({
    isLoading: false,
    showId: 'show-1',
    trialId: 'trial-1',
    classId: 'class-1',
    showName: 'Spring Show',
    trialLabel: 'Trial 1',
  }),
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'user-1' } }),
}));
vi.mock('./components/SessionToolbar', () => ({ SessionToolbar: () => null }));
vi.mock('./paperScoresheetData', () => ({
  loadEntriesWithDogs: vi.fn(async () => rows.list),
}));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    sync: vi.fn().mockResolvedValue({ success: false }),
    getCurrentAuthUserId: async () => 'user-test',
    getSyncMetadata: vi.fn(async () => ({ totalRows: 1, syncedByAuthUserId: 'user-test' })),
    subscribe: vi.fn(() => () => undefined),
    updateEntry: vi.fn(),
    whenShowSyncSettles: vi.fn(() => null),
  },
}));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: {
    getClassById: vi.fn().mockResolvedValue({
      id: 'class-1',
      name: 'Container Novice',
      trialId: 'trial-1',
    }),
    subscribe: vi.fn(() => () => undefined),
  },
}));
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: {
    getTrialById: vi.fn(async () => ({ id: 'trial-1', showId: 'show-1' })),
    subscribe: vi.fn(() => () => undefined),
  },
}));
vi.mock('@/services/replication/ReplicatedShowsTable', () => ({
  replicatedShowsTable: { get: vi.fn().mockResolvedValue(null) },
}));

import { PaperScoresheetPage } from './PaperScoresheetPage';

const dog = (entryId: string, callName: string, order: number): ScoringEntry =>
  ({
    entryId,
    classId: 'class-1',
    dogId: `dog-${entryId}`,
    callName,
    handler: 'Pat Handler',
    breed: 'Beagle',
    armband: 100 + order,
    status: 'pending',
    inRing: false,
    isScored: false,
    exhibitorOrder: order,
  }) as ScoringEntry;

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderPage(route: string) {
  return render(
    <Routes>
      <Route
        path="/scoring/classes/:classId/entries"
        element={
          <>
            <PaperScoresheetPage />
            <LocationProbe />
          </>
        }
      />
      <Route path="*" element={<LocationProbe />} />
    </Routes>,
    { initialRoute: route }
  );
}

const showDeskHome = getShowHomeHref({
  showId: 'show-1',
  state: { statuses: ['needs-attention'], selectedDays: ['2026-07-20'], focusedClassId: 'class-1' },
});
const fromShowDesk = getCockpitPaperScoringHref({ classId: 'class-1', returnTo: showDeskHome });

describe('PaperScoresheetPage remembered view (MYK9-1906)', () => {
  beforeEach(() => {
    localStorage.clear();
    rows.list = [dog('e1', 'Willow', 1), dog('e2', 'Cooper', 2)];
  });

  it('opens in the list view the first time', async () => {
    renderPage('/scoring/classes/class-1/entries');
    expect(await screen.findByText('0 of 2 scored')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Willow/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'next' })).not.toBeInTheDocument();
  });

  it('a second visit opens in the card view that was chosen last time', async () => {
    localStorage.setItem('paper-scoring-mode:user-1', 'sequential');
    renderPage('/scoring/classes/class-1/entries');
    expect(await screen.findByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'next' })).toBeInTheDocument();
  });

  it('an explicit mode in the URL wins over the saved view', async () => {
    localStorage.setItem('paper-scoring-mode:user-1', 'sequential');
    renderPage('/scoring/classes/class-1/entries?mode=split');
    expect(await screen.findByText('0 of 2 scored')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Willow/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'next' })).not.toBeInTheDocument();
  });

  it('opens in the list view when the saved view cannot be read', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    try {
      renderPage('/scoring/classes/class-1/entries');
      expect(await screen.findByText('0 of 2 scored')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Willow/ })).toBeInTheDocument();
    } finally {
      getItem.mockRestore();
    }
  });
});

describe('PaperScoresheetPage back link (MYK9-1907)', () => {
  beforeEach(() => {
    localStorage.clear();
    rows.list = [dog('e1', 'Willow', 1)];
  });

  it('from the Show Desk, goes back to it with the same class focused, and says so', async () => {
    renderPage(fromShowDesk);
    const back = await screen.findByRole('button', { name: /Back to show/ });
    fireEvent.click(back);
    expect((await screen.findByTestId('location')).textContent).toBe(showDeskHome);
  });

  it('opened any other way, still goes back to the class', async () => {
    renderPage('/scoring/classes/class-1/entries');
    fireEvent.click(await screen.findByRole('button', { name: /Back to Class/ }));
    expect((await screen.findByTestId('location')).textContent).toBe(
      '/shows/show-1/trials/trial-1/classes/class-1'
    );
  });

  it('refuses a returnTo that is not a Show Desk address', async () => {
    renderPage('/scoring/classes/class-1/entries?returnTo=https%3A%2F%2Fevil.example');
    expect(await screen.findByRole('button', { name: /Back to Class/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Back to show/ })).not.toBeInTheDocument();
  });

  it('keeps returnTo when the view toggle rewrites the query string', async () => {
    renderPage(fromShowDesk);
    await screen.findByRole('button', { name: /Back to show/ });
    fireEvent.click(screen.getByRole('tab', { name: /Card/i }));
    const location = (await screen.findByTestId('location')).textContent ?? '';
    const params = new URLSearchParams(location.split('?')[1]);
    expect(params.get('mode')).toBe('sequential');
    expect(params.get('returnTo')).toBe(showDeskHome);
    fireEvent.click(screen.getByRole('button', { name: /Back to show/ }));
    expect((await screen.findByTestId('location')).textContent).toBe(showDeskHome);
  });
});
