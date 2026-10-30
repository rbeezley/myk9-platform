/**
 * Integration test for the exhibitor-first "Your dogs today" show-day view
 * (openspec/changes/exhibitor-elderly-ux-remediation, section 3).
 */
import { Routes, Route, useLocation } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@/test/utils/testUtils';
import { ReplicationSyncTestProvider } from '@/test/utils/ReplicationSyncTestProvider';
import type { ReplicationSyncContextValue } from '@/context/ReplicationSyncContext';
import { UserRole } from '@/types/auth-types';
import { mockSupabase } from '@/test/mocks/supabase';
import type { OwnShowResult } from './myAtShowEntryDetails.helpers';

vi.mock('@/services/replication', () => ({
  replicatedArmbandsTable: {
    getByShow: vi.fn(async () => []),
    sync: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
  },
  replicatedShowsTable: {
    getShowById: vi.fn(),
    getAll: vi.fn().mockResolvedValue([]),
    get getAllOrThrow() {
      return this.getAll;
    },
    subscribe: vi.fn(() => vi.fn()),
  },
  replicatedTrialsTable: {
    getTrialsByShow: vi.fn(),
    getAll: vi.fn().mockResolvedValue([]),
    get getAllOrThrow() {
      return this.getAll;
    },
    subscribe: vi.fn(() => vi.fn()),
  },
  replicatedClassesTable: {
    getClassesByTrial: vi.fn(),
    getAll: vi.fn().mockResolvedValue([]),
    get getAllOrThrow() {
      return this.getAll;
    },
    subscribe: vi.fn(() => vi.fn()),
  },
  replicatedEntriesTable: {
    getEntriesByShow: vi.fn(),
    getAll: vi.fn().mockResolvedValue([]),
    get getAllOrThrow() {
      return this.getAll;
    },
    subscribe: vi.fn(() => vi.fn()),
  },
}));

const mockAuthState = vi.hoisted(() => ({
  hasRole: (_role: unknown): boolean => false,
  userWithRoles: null as unknown,
  user: null as { id: string } | null,
}));

// The row's results come from the exhibitor's own masked read (MYK9-1026);
// `useMyShowResults` has its own test, so the page test controls its answer.
const ownResults: { current: ReadonlyMap<string, OwnShowResult> } = { current: new Map() };
vi.mock('./useMyShowResults', () => ({ useMyShowResults: () => ownResults.current }));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => mockAuthState,
}));

// The self-check-in cascade is a live Supabase read (@/hooks/queries/useSelfCheckinEnabled),
// not a replicated table — mocked at the hook boundary, same as MyEntriesPage.test.tsx,
// rather than deep-mocking the show_visibility_settings/trial_visibility_overrides/
// class_visibility_overrides query chain. Defaults every class 'allowed' so these tests'
// existing assertions (dog name, class name) are unaffected by MYK9-800's new gate;
// overridden per-test below to prove the gate actually wires through.
const mockSelfCheckinStateMap = vi.hoisted(() =>
  vi.fn((classIds: string[]) => Object.fromEntries(classIds.map(classId => [classId, 'allowed'])))
);
vi.mock('@/hooks/queries/useSelfCheckinEnabled', () => ({
  useSelfCheckinStateMap: mockSelfCheckinStateMap,
}));

import { AtShowClassListPage } from './AtShowClassListPage';
import { RingsideReturnBar } from './menu/RingsideReturnBar';
import {
  replicatedShowsTable,
  replicatedTrialsTable,
  replicatedClassesTable,
  replicatedEntriesTable,
} from '@/services/replication';

const settledSyncStatus: ReplicationSyncContextValue['status'] = {
  isSyncing: false,
  lastSyncAt: new Date('2026-06-01T12:00:00Z'),
  error: null,
  tablesStatus: { shows: 'success', trials: 'success', classes: 'success', entries: 'success' },
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
    {
      id: 'class-1',
      element: 'Container',
      level: 'Novice',
      section: '-',
      classStatus: 'in_progress',
      classOrder: 1,
      judgeName: 'Judge J',
    },
  ] as never);
}

function seedOwnedEntry(overrides: Record<string, unknown> = {}) {
  mockSupabase.rpc.mockImplementation((fn: string) => {
    if (fn === 'get_account_today_entries') {
      return Promise.resolve({
        data: [{ entry_id: 'entry-1', show_id: 'show-1', show_name: 'Spring Trial' }],
        error: null,
      }) as never;
    }
    return Promise.resolve({ data: null, error: null }) as never;
  });
  vi.mocked(replicatedEntriesTable.getEntriesByShow).mockResolvedValue([
    {
      id: 'entry-1',
      showId: 'show-1',
      classId: 'class-1',
      dogCallName: 'Rex',
      armband: '101',
      checkInStatus: 'no-status',
      runOrder: 3,
      isScored: false,
      ...overrides,
    },
  ] as never);
}

function SearchProbe() {
  return <div data-testid="search">{useLocation().search}</div>;
}

const renderPage = () =>
  render(
    <ReplicationSyncTestProvider
      value={{ status: settledSyncStatus, triggerSync: vi.fn(), syncTable: vi.fn() }}
    >
      <Routes>
        <Route path="/at-show/:showId" element={<AtShowClassListPage />} />
        <Route path="/at-show/:showId/class/:classId" element={<div>SINGLE PAGE</div>} />
      </Routes>
    </ReplicationSyncTestProvider>,
    { initialRoute: '/at-show/show-1' }
  );

describe('AtShowClassListPage — exhibitor "Your dogs today" default', () => {
  beforeEach(() => {
    ownResults.current = new Map();
    vi.clearAllMocks();
    window.localStorage.clear();
    seed();
    mockAuthState.hasRole = () => false;
    mockAuthState.userWithRoles = null;
    mockAuthState.user = null;
    mockSelfCheckinStateMap.mockImplementation((classIds: string[]) =>
      Object.fromEntries(classIds.map(classId => [classId, 'allowed']))
    );
  });

  it('defaults an exhibitor-only account with owned entries to "Your dogs today"', async () => {
    mockAuthState.hasRole = role => role === UserRole.EXHIBITOR;
    mockAuthState.user = { id: 'user-1' };
    seedOwnedEntry();

    renderPage();

    expect(await screen.findByText('Your dogs today')).toBeInTheDocument();
    expect(await screen.findByText('Rex')).toBeInTheDocument();
    expect(screen.getByText('#101')).toBeInTheDocument();
  });

  const ownQualified = (resultsReleasedAt: string | null) =>
    new Map<string, OwnShowResult>([
      [
        'entry-1',
        {
          isScored: true,
          resultStatus: 'qualified',
          searchTimeSeconds: 58,
          totalFaults: 1,
          finalPlacement: null,
          resultsReleasedAt,
        },
      ],
    ]);

  it('shows the released Q, time and faults from the own masked read', async () => {
    mockAuthState.hasRole = role => role === UserRole.EXHIBITOR;
    mockAuthState.user = { id: 'user-1' };
    seedOwnedEntry({ dogCallName: 'Ranger', checkInStatus: 'completed', isScored: true });
    ownResults.current = ownQualified('2026-06-01T18:00:00Z');

    renderPage();

    expect(await screen.findByText('Ranger')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(await screen.findByText('Q')).toBeInTheDocument();
    expect(screen.getByText('58.0s')).toBeInTheDocument();
    expect(screen.getByText('1 fault')).toBeInTheDocument();
    expect(screen.queryByText('preliminary')).not.toBeInTheDocument();
  });

  it('labels an unreleased own result preliminary (owner decision, MYK9-1026)', async () => {
    mockAuthState.hasRole = role => role === UserRole.EXHIBITOR;
    mockAuthState.user = { id: 'user-1' };
    seedOwnedEntry({ checkInStatus: 'completed', isScored: true });
    ownResults.current = ownQualified(null);

    renderPage();

    expect(await screen.findByText('Rex')).toBeInTheDocument();
    expect(await screen.findByText('Q')).toBeInTheDocument();
    expect(screen.getByText('58.0s')).toBeInTheDocument();
    expect(screen.getByText('preliminary')).toBeInTheDocument();
  });

  it('never shows a score the own read withheld, even when the show replica holds one', async () => {
    mockAuthState.hasRole = role => role === UserRole.EXHIBITOR;
    mockAuthState.user = { id: 'user-1' };
    // A staff session on this device left an unmasked score in the replica.
    seedOwnedEntry({
      checkInStatus: 'completed',
      isScored: true,
      resultStatus: 'qualified',
      searchTimeSeconds: 58,
    });
    ownResults.current = new Map();

    renderPage();

    expect(await screen.findByText('Rex')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.queryByText('Q')).not.toBeInTheDocument();
    expect(screen.queryByText('58.0s')).not.toBeInTheDocument();
  });

  it('keeps the class-first default for a secretary who also exhibits', async () => {
    mockAuthState.hasRole = role => role === UserRole.EXHIBITOR || role === UserRole.SECRETARY;
    mockAuthState.user = { id: 'user-1' };
    seedOwnedEntry();

    renderPage();

    expect(await screen.findByText(/Container Novice/)).toBeInTheDocument();
    expect(screen.queryByText('Your dogs today')).not.toBeInTheDocument();
    // MYK9-1184: the "All classes" heading is for exhibitor-only viewers.
    expect(screen.queryByRole('heading', { name: 'All classes' })).not.toBeInTheDocument();
  });

  it('lets the exhibitor switch to the full class list and back', async () => {
    mockAuthState.hasRole = role => role === UserRole.EXHIBITOR;
    mockAuthState.user = { id: 'user-1' };
    seedOwnedEntry();

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'See all classes' }));
    expect(await screen.findByText(/Container Novice/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Your dogs today' }));
    await waitFor(() => {
      expect(screen.getByText('Rex')).toBeInTheDocument();
    });
  });

  // MYK9-1508: the ringside menu is reachable from the exhibitor's default
  // screen, and the chosen view lives in the URL so the menu's return restores it.
  it('offers the ringside menu on "Your dogs today"', async () => {
    mockAuthState.hasRole = role => role === UserRole.EXHIBITOR;
    mockAuthState.user = { id: 'user-1' };
    seedOwnedEntry();

    renderPage();

    expect(await screen.findByTestId('at-show-my-entries-today')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ringside menu' })).toBeInTheDocument();
  });

  it('keeps the chosen class-list view in the URL', async () => {
    mockAuthState.hasRole = role => role === UserRole.EXHIBITOR;
    mockAuthState.user = { id: 'user-1' };
    seedOwnedEntry();

    render(
      <ReplicationSyncTestProvider
        value={{ status: settledSyncStatus, triggerSync: vi.fn(), syncTable: vi.fn() }}
      >
        <Routes>
          <Route path="/at-show/:showId" element={<AtShowClassListPage />} />
        </Routes>
        <SearchProbe />
      </ReplicationSyncTestProvider>,
      { initialRoute: '/at-show/show-1' }
    );

    fireEvent.click(await screen.findByRole('button', { name: 'See all classes' }));
    expect(await screen.findByText(/Container Novice/)).toBeInTheDocument();
    expect(screen.getByTestId('search')).toHaveTextContent('?view=all');
  });

  it('returns from a menu destination opened in All classes to All classes', async () => {
    mockAuthState.hasRole = role => role === UserRole.EXHIBITOR;
    mockAuthState.user = { id: 'user-1' };
    seedOwnedEntry();

    const { user } = render(
      <ReplicationSyncTestProvider
        value={{ status: settledSyncStatus, triggerSync: vi.fn(), syncTable: vi.fn() }}
      >
        <RingsideReturnBar />
        <Routes>
          <Route path="/at-show/:showId" element={<AtShowClassListPage />} />
          <Route path="/account" element={<div>ACCOUNT PAGE</div>} />
        </Routes>
      </ReplicationSyncTestProvider>,
      { initialRoute: '/at-show/show-1' }
    );

    await user.click(await screen.findByRole('button', { name: 'See all classes' }));
    expect(await screen.findByText(/Container Novice/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ringside menu' }));
    await user.click(await screen.findByRole('button', { name: 'Settings' }));
    expect(await screen.findByText('ACCOUNT PAGE', {}, { timeout: 3000 })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back to ringside' }));
    expect(await screen.findByText(/Container Novice/)).toBeInTheDocument();
    expect(screen.queryByTestId('at-show-my-entries-today')).not.toBeInTheDocument();
  });

  // MYK9-1184: the all-days list used to sit under a "Your dogs today" button
  // and show a permanent "Entry count not loaded yet" on every row.
  it('heads the exhibitor all-classes list "All classes" with no permanent not-loaded counts', async () => {
    mockAuthState.hasRole = role => role === UserRole.EXHIBITOR;
    mockAuthState.user = { id: 'user-1' };
    seedOwnedEntry();

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'See all classes' }));
    expect(await screen.findByText(/Container Novice/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'All classes' })).toBeInTheDocument();
    expect(screen.queryByText('Entry count not loaded yet')).not.toBeInTheDocument();
  });

  it('explains an unposted running order instead of a contradictory empty state', async () => {
    mockAuthState.hasRole = role => role === UserRole.EXHIBITOR;
    mockAuthState.user = { id: 'user-1' };
    seedOwnedEntry({ classId: 'class-not-loaded-yet', runOrder: undefined });

    renderPage();

    expect(await screen.findByText('Rex')).toBeInTheDocument();
    expect(screen.getByText('Running order not posted yet')).toBeInTheDocument();
    expect(screen.getByText('Not posted yet')).toBeInTheDocument();
    expect(screen.queryByText('This show has no classes yet.')).not.toBeInTheDocument();
  });

  // MYK9-774: the entries read now throws on a failed device read. Before, it
  // answered [] and an exhibitor was told their entries "haven't loaded yet".
  // The page reads the same table for its class list, so it shows its own
  // error with a retry.
  it('shows an error, not an empty list, when the device cannot read entries', async () => {
    mockAuthState.hasRole = role => role === UserRole.EXHIBITOR;
    mockAuthState.user = { id: 'user-1' };
    seedOwnedEntry();
    vi.mocked(replicatedEntriesTable.getEntriesByShow).mockRejectedValue(
      new Error('Could not read entries on this device')
    );

    renderPage();

    expect(
      await screen.findByText(/The class list could not be read on this device/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/haven't loaded yet/)).not.toBeInTheDocument();
  });

  // MYK9-800 follow-up: proves the resolved self-check-in cascade actually
  // reaches this page, end to end — not just the pure helper in isolation.
  it('hides Check In and explains why when the self-check-in cascade reports the class closed', async () => {
    mockAuthState.hasRole = role => role === UserRole.EXHIBITOR;
    mockAuthState.user = { id: 'user-1' };
    seedOwnedEntry();
    mockSelfCheckinStateMap.mockImplementation((classIds: string[]) =>
      Object.fromEntries(classIds.map(classId => [classId, 'not-allowed']))
    );

    renderPage();

    expect(await screen.findByText('Rex')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Check in/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Self check-in is off for this class/)).toBeInTheDocument();
  });

  // MYK9-800 follow-up P1 (Codex): the batch cascade query errors (or the
  // device is offline) must never fall open. Red on 73dec6f89, where the
  // page defaulted a missing map entry to `true` (open).
  it('hides Check In and shows the calm unknown-state message when the cascade cannot be resolved', async () => {
    mockAuthState.hasRole = role => role === UserRole.EXHIBITOR;
    mockAuthState.user = { id: 'user-1' };
    seedOwnedEntry();
    mockSelfCheckinStateMap.mockImplementation((classIds: string[]) =>
      Object.fromEntries(classIds.map(classId => [classId, 'unknown']))
    );

    renderPage();

    expect(await screen.findByText('Rex')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Check in/ })).not.toBeInTheDocument();
    expect(
      screen.getByText(/Check-in isn't available right now\. Ask at the show desk\./)
    ).toBeInTheDocument();
  });
});
