import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Routes, Route } from 'react-router-dom';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { ShowManagementShell, type ShowManagementShellProps } from '../ShowManagementShell';
import { buildShowManagementTabDefs } from '@/pages/ShowDetailsPage.tabDefs';
import type { ShowDetailTabsProps } from '../ShowDetailTabs';
import type { Show } from '@/types/show-types';
import type { SyncableTrial } from '@/store/trial-store-types';
import { useTrialStore } from '@/store/trialStore';

// MYK9-2375: pressing a trial's "Change day" button in Edit Show closes the sheet and opens THAT
// trial's existing Edit Trial on the same page. The real shell, Edit Show panel, row actions and
// Edit Trial panel run together; only data sources and unrelated page chrome are stubbed.

const dataMocks = vi.hoisted(() => ({ trialRows: [] as unknown[] }));

vi.mock('@/hooks/queries/useShowTrials', () => ({
  useShowTrials: () => ({ data: dataMocks.trialRows }),
}));
vi.mock('@/hooks/queries/useJudgesWithQualifications', () => ({
  useJudgesWithQualifications: () => ({ data: [] }),
}));
vi.mock('@/hooks/useConnectionHint', () => ({ useConnectionHint: () => undefined }));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    userWithRoles: { roles: ['site_admin'], scopes: [] },
    user: { id: 'user-1' },
    hasRole: () => true,
  }),
}));
vi.mock('@/hooks/useShowManageScope', () => ({
  useShowManageScope: () => ({
    status: 'resolved',
    canManage: true,
    canOperate: true,
    hasOperationalStaffRole: true,
    clubId: 'club-1',
  }),
}));
vi.mock('@/services/replication', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services/replication')>();
  return {
    ...actual,
    replicatedTrialsTable: { ...actual.replicatedTrialsTable, sync: vi.fn() },
  };
});
vi.mock('@/features/premium/usePremiumPublishControl', () => ({
  usePremiumPublishControl: () => ({
    infoState: 'loading',
    hasPublishedPremium: false,
    landingUnpublished: false,
  }),
}));

// Page chrome that is not under test.
vi.mock('@/components/common/PageShell', () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/common/PageHeader', () => ({ PageHeader: () => null }));
vi.mock('@/components/common/DetailHero', () => ({ DetailHero: () => null }));
vi.mock('@/components/shows/ShowDateBlock', () => ({ ShowDateBlock: () => null }));
vi.mock('@/components/shows/overview/QuickInfoCards', () => ({ QuickInfoCards: () => null }));
vi.mock('@/components/shows/ShowStatusPill', () => ({ ShowStatusPill: () => null }));
vi.mock('@/features/show-presence/ShowPresenceStack', () => ({ ShowPresenceStack: () => null }));
vi.mock('@/features/show-live-sync/LiveUpdateIndicator', () => ({
  LiveUpdateIndicator: () => null,
}));
vi.mock('@/features/offline-readiness/OfflineReadyBadge', () => ({
  OfflineReadyBadge: () => null,
}));
vi.mock('@/components/shows/ShowDetails/ShowSyncStatus', () => ({
  useSyncNote: () => ({ label: 'All changes saved', needsAttention: false }),
}));
vi.mock('@/components/shows/tabs/ShowOverviewTab', () => ({ ShowOverviewTab: () => null }));
vi.mock('@/pages/secretary/ShowWorkbenchShowDeskPage', () => ({
  ShowWorkbenchShowDeskPage: () => null,
}));

const show = {
  id: 'show-1',
  name: 'Test Show',
  status: 'Upcoming',
  clubId: 'club-1',
  clubName: 'Bergen KC',
  organization: 'AKC',
} as Show;

const ROWS = [
  { id: 'trial-1', name: 'Saturday Trial 1', trial_number: '1', date: '2026-12-12' },
  { id: 'trial-2', name: 'Sunday Trial 2', trial_number: '2', date: '2026-12-13' },
];

const syncable = (row: (typeof ROWS)[number]): SyncableTrial =>
  ({
    id: row.id,
    showId: 'show-1',
    showName: 'Test Show',
    name: row.name,
    trialNumber: row.trial_number,
    trialDate: row.date,
    status: 'Upcoming',
    eventNumber: '1',
    order: '1',
    _version: 1,
    _lastModified: new Date('2026-12-01T00:00:00Z'),
    _lastModifiedBy: 'user-1',
    _syncStatus: 'synced',
  }) as SyncableTrial;

function props(): ShowManagementShellProps {
  const tabs: ShowDetailTabsProps = {
    show,
    tabs: [],
    activeTab: 'overview',
    onTabChange: vi.fn(),
    canManageShow: true,
    isAuthenticated: true,
    hasUserEntries: false,
    judges: [],
    classes: [],
    trials: [],
    trialStats: {},
  };
  return {
    show,
    showId: 'show-1',
    breadcrumbs: [],
    catalogEntryCount: 0,
    canonicalShowHref: '/shows/show-1',
    activeManagementSection: undefined,
    tabs,
    sectionTabs: buildShowManagementTabDefs({
      catalogEntryCount: 0,
      managerEntryDataUnavailable: false,
      resultsCount: 0,
    }),
  };
}

function renderShell() {
  return render(
    <Routes>
      <Route path="/shows/:id" element={<ShowManagementShell {...props()} />}>
        <Route index element={<div>section</div>} />
      </Route>
    </Routes>,
    { initialRoute: '/shows/show-1?edit=true' }
  );
}

describe('ShowManagementShell: Edit Show trial day buttons', () => {
  beforeEach(() => {
    dataMocks.trialRows = ROWS;
    useTrialStore.setState({ trials: ROWS.map(syncable) });
  });

  it("closes Edit Show and opens that trial's Edit Trial when its button is pressed", async () => {
    const { user } = renderShell();

    expect(
      await screen.findByRole('button', { name: /^Sunday Trial 2 .*Change day$/ })
    ).toBeVisible();
    expect(screen.getAllByRole('button', { name: /Change day$/ })).toHaveLength(2);
    expect(screen.queryByText('Edit Trial')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Sunday Trial 2 .*Change day$/ }));

    await waitFor(() => expect(screen.getByText('Edit Trial')).toBeInTheDocument());
    expect(screen.getByDisplayValue('Sunday Trial 2')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Saturday Trial 1')).not.toBeInTheDocument();
    // The Edit Show sheet is gone: its dates text and buttons no longer render.
    expect(screen.queryByTestId('show-dates-text')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /Change day$/ })).toHaveLength(0);
  });

  it('offers exactly one button on a one-trial show', async () => {
    dataMocks.trialRows = [ROWS[0]];
    renderShell();

    await screen.findByRole('button', { name: /^Saturday Trial 1 .*Change day$/ });
    expect(screen.getAllByRole('button', { name: /Change day$/ })).toHaveLength(1);
  });
});
