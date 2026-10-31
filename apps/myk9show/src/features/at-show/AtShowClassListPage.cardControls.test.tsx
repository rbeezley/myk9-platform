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

const lookup = vi.hoisted(() => ({ scoresheetKey: vi.fn(), toastError: vi.fn() }));
vi.mock('@/pages/scoring/types', async importOriginal => ({
  ...(await importOriginal<typeof import('@/pages/scoring/types')>()),
  scoresheetKeyForClass: lookup.scoresheetKey,
}));
vi.mock('sonner', async importOriginal => {
  const actual = await importOriginal<typeof import('sonner')>();
  return { ...actual, toast: Object.assign(actual.toast, { error: lookup.toastError }) };
});

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
  lookup.scoresheetKey.mockReset();
  lookup.toastError.mockReset();
  vi.mocked(replicatedClassesTable.getClassById).mockResolvedValue(null as never);
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

  it("shows a combined A/B card's merged status in its details, not section A's", async () => {
    const withPhase = (id: string, ringPhase: string | null) => {
      const row = CLASSES.find(c => c.id === id) as Record<string, unknown>;
      return { ...row, name: 'Container Novice', ringPhase };
    };
    const sectionA = withPhase('class-a', null);
    const sectionB = withPhase('class-b', 'offline_scoring');
    vi.mocked(replicatedClassesTable.getClassesByTrial).mockResolvedValue(
      CLASSES.map(c => (c.id === 'class-a' ? sectionA : c.id === 'class-b' ? sectionB : c)) as never
    );
    vi.mocked(replicatedClassesTable.getClassById).mockImplementation((async (id: string) =>
      id === 'class-a' ? sectionA : id === 'class-b' ? sectionB : null) as never);
    renderPage();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Class details for Container Novice A & B' })
    );
    const dialog = await screen.findByRole('dialog', { name: 'Class details' });
    expect(await within(dialog).findByText('Offline Scoring')).toBeInTheDocument();
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

describe('options session', () => {
  it('reopens a card on the options menu, not the sub-dialog it last closed', async () => {
    role.primary = UserRole.SECRETARY;
    renderPage();
    const open = async () =>
      fireEvent.click(
        await screen.findByRole('button', { name: 'Class options for Interior Excellent' })
      );

    await open();
    fireEvent.click(await screen.findByRole('button', { name: 'Requirements' }));
    expect(screen.queryByRole('button', { name: 'Set Max Time' })).not.toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await open();
    expect(await screen.findByRole('button', { name: 'Set Max Time' })).toBeInTheDocument();
  });
});

describe('Set Max Time scoring-mode lookup', () => {
  const liveClass = { id: 'class-c', name: 'Interior Excellent' };

  it('shows loading with a working Cancel while the class lookup is pending', async () => {
    role.primary = UserRole.SECRETARY;
    lookup.scoresheetKey.mockReturnValue(new Promise(() => {}));
    vi.mocked(replicatedClassesTable.getClassById).mockResolvedValue(liveClass as never);
    renderPage();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Class options for Interior Excellent' })
    );
    await waitFor(() => expect(lookup.scoresheetKey).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole('button', { name: 'Set Max Time' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('status')).toHaveTextContent(
      'Checking how this class is timed'
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows an error with Retry when the lookup fails, and opens the form on retry', async () => {
    role.primary = UserRole.SECRETARY;
    lookup.scoresheetKey.mockRejectedValueOnce(new Error('offline'));
    lookup.scoresheetKey.mockResolvedValue('AKC_SCENT_WORK');
    vi.mocked(replicatedClassesTable.getClassById).mockResolvedValue(liveClass as never);
    renderPage();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Class options for Interior Excellent' })
    );
    await waitFor(() => expect(lookup.toastError).toHaveBeenCalledTimes(1));
    fireEvent.click(await screen.findByRole('button', { name: 'Set Max Time' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't check how this class is timed");
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(lookup.scoresheetKey).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('offers Retry, not a stuck dialog, when the live class row never loads', async () => {
    role.primary = UserRole.SECRETARY;
    renderPage();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Class options for Interior Excellent' })
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Set Max Time' }));
    const alert = await screen.findByRole('alert');
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    await waitFor(() =>
      expect(vi.mocked(replicatedClassesTable.getClassById).mock.calls.length).toBeGreaterThan(2)
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('opens the form once the scoring mode is known', async () => {
    role.primary = UserRole.SECRETARY;
    lookup.scoresheetKey.mockResolvedValue('AKC_SCENT_WORK');
    vi.mocked(replicatedClassesTable.getClassById).mockResolvedValue(liveClass as never);
    renderPage();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Class options for Interior Excellent' })
    );
    await waitFor(() => expect(lookup.scoresheetKey).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole('button', { name: 'Set Max Time' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(lookup.toastError).not.toHaveBeenCalled();
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
