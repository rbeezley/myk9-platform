/**
 * MYK9-1506 through the real page: tabs with counts, search, sort, the heart
 * (persisting across a reload), the info and options controls, the upload
 * indicator fed by the queued-mutation reader, and the refresh control.
 * Rendering the page, not just the row, is what proves the props reach the card.
 */
import { Routes, Route } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@/test/utils/testUtils';
import { ReplicationSyncTestProvider } from '@/test/utils/ReplicationSyncTestProvider';
import type { ReplicationSyncContextValue } from '@/context/ReplicationSyncContext';

vi.mock('@/services/replication', () => ({
  replicatedArmbandsTable: {
    getByShow: vi.fn(async () => []),
    sync: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
  },
  replicatedShowsTable: { getShowById: vi.fn() },
  replicatedTrialsTable: { getTrialsByShow: vi.fn(), subscribe: vi.fn(() => vi.fn()) },
  replicatedClassesTable: {
    getClassesByTrial: vi.fn(),
    getClassById: vi.fn(async () => null),
    subscribe: vi.fn(() => vi.fn()),
  },
  replicatedEntriesTable: { getEntriesByShow: vi.fn(), subscribe: vi.fn(() => vi.fn()) },
}));

vi.mock('@/services/database/judges', () => ({
  getActiveJudgeAssignmentsForShow: vi.fn(async () => []),
  subscribeToJudgeAssignmentChanges: vi.fn(() => vi.fn()),
}));

const queue = vi.hoisted(() => ({ pending: [] as unknown[] }));
vi.mock('@/services/replication/sharedMutationManager', () => ({
  mutationManager: {
    getPendingMutationsForTable: vi.fn(async () => queue.pending),
    getPendingCount: vi.fn(async () => queue.pending.length),
  },
}));

// The real role hook runs; the account's primary role decides Class Options access
// (a secretary is a class manager, an exhibitor is not).
const role = vi.hoisted(() => ({ primary: null as string | null }));

const sync = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock('./atShowDataAdapter', async importOriginal => ({
  ...(await importOriginal<typeof import('./atShowDataAdapter')>()),
  syncAtShowData: sync.run,
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    hasRole: () => false,
    user: null,
    userWithRoles: null,
    getUserRoles: () => [],
  }),
  getPrimaryRole: () => role.primary,
}));

import { UserRole } from '@/types/auth-types';
import { AtShowClassListPage } from './AtShowClassListPage';
import {
  replicatedClassesTable,
  replicatedEntriesTable,
  replicatedShowsTable,
  replicatedTrialsTable,
} from '@/services/replication';

const cls = (id: string, element: string, level: string, extra: Record<string, unknown> = {}) => ({
  id,
  element,
  level,
  section: '-',
  classStatus: 'setup',
  classOrder: 1,
  judgeName: 'Judge J',
  ...extra,
});
const CLASSES = [
  cls('class-a', 'Container', 'Novice', { section: 'A', classStatus: 'in_progress' }),
  cls('class-b', 'Container', 'Novice', { section: 'B', classStatus: 'in_progress' }),
  cls('class-c', 'Interior', 'Excellent', { judgeName: 'Judge Kowalski' }),
  cls('class-e', 'Buried', 'Advanced'),
  cls('class-f', 'Exterior', 'Master', { classStatus: 'completed' }),
];

const status: ReplicationSyncContextValue['status'] = {
  isSyncing: false,
  lastSyncAt: new Date('2026-06-01T12:00:00Z'),
  error: null,
  tablesStatus: { shows: 'success', trials: 'success', classes: 'success', entries: 'success' },
};

function renderPage() {
  return render(
    <ReplicationSyncTestProvider value={{ status, triggerSync: vi.fn(), syncTable: vi.fn() }}>
      <Routes>
        <Route path="/at-show/:showId" element={<AtShowClassListPage />} />
      </Routes>
    </ReplicationSyncTestProvider>,
    { initialRoute: '/at-show/show-1' }
  );
}

const cardNames = () =>
  Array.from(document.querySelectorAll('li[data-class-id] span.truncate.font-medium')).map(
    el => el.textContent
  );

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  queue.pending = [];
  role.primary = UserRole.EXHIBITOR;
  sync.run.mockResolvedValue({ success: true });
  vi.mocked(replicatedShowsTable.getShowById).mockResolvedValue({
    name: 'Spring Trial',
    organization: 'AKC Scent Work',
  } as never);
  vi.mocked(replicatedTrialsTable.getTrialsByShow).mockResolvedValue([
    { id: 'trial-1', name: 'Trial 1', trialNumber: 'Trial 1', date: '2026-06-01' },
  ] as never);
  vi.mocked(replicatedClassesTable.getClassesByTrial).mockResolvedValue(CLASSES as never);
  vi.mocked(replicatedEntriesTable.getEntriesByShow).mockResolvedValue([] as never);
});

describe('tabs, search and sort', () => {
  it('defaults to Pending and counts every tab', async () => {
    renderPage();
    const pending = await screen.findByRole('tab', { name: /Pending/ });
    expect(pending).toHaveAttribute('aria-selected', 'true');
    expect(pending).toHaveTextContent('3');
    expect(screen.getByRole('tab', { name: /In Progress/ })).toHaveTextContent('1');
    expect(screen.getByRole('tab', { name: /Favorites/ })).toHaveTextContent('0');
    expect(screen.getByRole('tab', { name: /Completed/ })).toHaveTextContent('1');
    expect(cardNames()).not.toContain('Exterior Master');
  });

  it('filters the list by tab', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: /Completed/ }));
    expect(cardNames()).toEqual(['Exterior Master']);

    fireEvent.click(screen.getByRole('tab', { name: /In Progress/ }));
    expect(cardNames()).toEqual(['Container Novice A & B']);
  });

  it('searches class name, level, judge and section', async () => {
    renderPage();
    const search = await screen.findByRole('searchbox', { name: 'Search classes' });

    fireEvent.change(search, { target: { value: 'kowalski' } });
    expect(cardNames()).toEqual(['Interior Excellent']);
    fireEvent.change(search, { target: { value: 'advanced' } });
    expect(cardNames()).toEqual(['Buried Advanced']);
    fireEvent.change(search, { target: { value: 'nothing matches this' } });
    expect(screen.getByText(/No classes match/)).toBeInTheDocument();
  });

  it('sorts Element → Level and Level → Element', async () => {
    renderPage();
    const sort = await screen.findByRole('combobox', { name: 'Sort classes' });
    expect(
      within(sort)
        .getAllByRole('option')
        .map(o => o.textContent)
    ).toEqual(['Run Order', 'Element → Level', 'Level → Element']);

    fireEvent.change(sort, { target: { value: 'element-level' } });
    expect(cardNames()).toEqual([
      'Buried Advanced',
      'Container Novice A & B',
      'Interior Excellent',
    ]);
    fireEvent.change(sort, { target: { value: 'level-element' } });
    expect(cardNames()).toEqual([
      'Container Novice A & B',
      'Buried Advanced',
      'Interior Excellent',
    ]);
  });
});

describe('favorites', () => {
  it('hearts a class, persists across a reload, and lists it under Favorites', async () => {
    const first = renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Favorite Interior Excellent' }));
    expect(screen.getByRole('button', { name: 'Favorite Interior Excellent' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    first.unmount();

    renderPage();
    const heart = await screen.findByRole('button', { name: 'Favorite Interior Excellent' });
    expect(heart).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('tab', { name: /Favorites/ })).toHaveTextContent('1');
    fireEvent.click(screen.getByRole('tab', { name: /Favorites/ }));
    expect(cardNames()).toEqual(['Interior Excellent']);
  });

  it('toggles both sections of a combined A/B card', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Favorite Container Novice A & B' }));
    const saved = JSON.parse(window.localStorage.getItem('favorites_show-1_trial-1') ?? '[]');
    expect([...saved].sort()).toEqual(['class-a', 'class-b']);
  });
});

describe('details and options', () => {
  it('opens the shared class details from the info icon', async () => {
    renderPage();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Class details for Interior Excellent' })
    );
    const dialog = await screen.findByRole('dialog', { name: 'Class details' });
    expect(within(dialog).getByText('Judge Kowalski')).toBeInTheDocument();
  });

  it('hides the options ellipsis from roles that cannot manage classes', async () => {
    renderPage();
    await screen.findByText('Interior Excellent');
    expect(screen.queryByRole('button', { name: /Class options for/ })).not.toBeInTheDocument();
  });

  it('opens Class Options for a class manager, on single classes only', async () => {
    role.primary = UserRole.SECRETARY;
    renderPage();
    await screen.findByText('Interior Excellent');
    expect(
      screen.queryByRole('button', { name: 'Class options for Container Novice A & B' })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Class options for Interior Excellent' }));
    expect(await screen.findByRole('button', { name: 'Requirements' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set Max Time' })).toBeInTheDocument();
  });
});

describe('upload indicator', () => {
  const queuedScore = {
    tableName: 'entries',
    rowId: 'entry-1',
    rpc: { name: 'ringside_update_entry', fields: { is_scored: true } },
  };

  it('flags only the class holding scores queued on this device', async () => {
    queue.pending = [queuedScore];
    vi.mocked(replicatedEntriesTable.getEntriesByShow).mockResolvedValue([
      { id: 'entry-1', classId: 'class-c', showId: 'show-1' },
    ] as never);
    renderPage();

    const card = (await screen.findByText('Interior Excellent')).closest('li') as HTMLElement;
    expect(await within(card).findByText('1 score not uploaded yet')).toBeInTheDocument();
    expect(within(card).getByText('Offline Scoring')).toBeInTheDocument();
    expect(screen.getAllByText(/not uploaded yet/)).toHaveLength(1);
  });

  it('shows nothing when the queue is empty', async () => {
    renderPage();
    await screen.findByText('Interior Excellent');
    expect(screen.queryByText(/not uploaded yet/)).not.toBeInTheDocument();
    expect(screen.queryByText('Offline Scoring')).not.toBeInTheDocument();
  });
});

describe('refresh', () => {
  it('re-syncs the show and announces the result', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Refresh classes' }));
    await waitFor(() => expect(sync.run).toHaveBeenCalledWith('show-1', { forceFullSync: true }));
    expect(await screen.findAllByText('Classes up to date')).not.toHaveLength(0);
  });

  it('says so when the sync fails', async () => {
    sync.run.mockResolvedValue({ success: false });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Refresh classes' }));
    expect((await screen.findAllByText(/Couldn't refresh/)).length).toBeGreaterThan(0);
  });
});
