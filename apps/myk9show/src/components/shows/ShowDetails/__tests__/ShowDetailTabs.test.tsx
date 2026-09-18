import { render as rtlRender, screen, fireEvent } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { ShowDetailTabs, type ShowDetailTabsProps } from '../ShowDetailTabs';

const render = (ui: ReactElement) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>);
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import { LayoutDashboard } from 'lucide-react';

// Stub the tab content components — this suite verifies ShowDetailTabs' OWN
// branching (which content each tab shows, gating), not the children themselves.
vi.mock('@/components/shows/tabs/ShowOverviewTab', () => ({
  ShowOverviewTab: ({
    onViewClasses,
    isAuthenticated,
  }: {
    onViewClasses: () => void;
    isAuthenticated: boolean;
  }) => (
    <button
      data-testid="overview-tab"
      data-authenticated={String(isAuthenticated)}
      onClick={onViewClasses}
    >
      overview
    </button>
  ),
}));
vi.mock('@/components/shows/tabs/TrialsTab', () => ({
  TrialsTab: () => <div data-testid="trials-tab">trials</div>,
}));
vi.mock('@/components/shows/tabs/ClassesTab', () => ({
  ClassesTab: ({ hideRing }: { hideRing: boolean }) => (
    <div data-testid="classes-tab" data-hide-ring={String(hideRing)}>
      classes
    </div>
  ),
}));
vi.mock('@/components/shows/tabs/MyEntriesTab', () => ({
  MyEntriesTab: () => <div data-testid="my-entries-tab">my entries</div>,
}));
vi.mock('@/components/results/ShowResultsTab', () => ({
  ShowResultsTab: () => <div data-testid="results-tab">results</div>,
}));

function makeShow(): Show {
  return { id: 'show-1', name: 'Test Show' } as Show;
}

function makeTrial(overrides: Partial<Trial> = {}): Trial {
  return { id: 't1', showId: 'show-1', ...overrides } as unknown as Trial;
}

function renderTabs(overrides: Partial<ShowDetailTabsProps> = {}) {
  const props: ShowDetailTabsProps = {
    show: makeShow(),
    tabs: [{ id: 'overview', label: 'Overview', icon: LayoutDashboard }],
    activeTab: 'overview',
    onTabChange: vi.fn(),
    canManageShow: false,
    isAuthenticated: true,
    hasUserEntries: false,
    judges: [],
    classes: [],
    trials: [],
    trialStats: {},
    // `canShowMap`, `mapTrials`, `mapClasses` and `mapEntries` are still on
    // `ShowDetailTabsProps` because that object IS the outlet context the six
    // tab pages read (Setup's map view is the only consumer). `ShowDetailTabs`
    // itself no longer destructures them, so the fixture does not supply them —
    // carrying them here made the deleted panel look covered.
    canShowMap: false,
    mapTrials: [],
    mapClasses: [],
    mapEntries: [],
    ...overrides,
  };
  return { props, ...render(<ShowDetailTabs {...props} />) };
}

describe('ShowDetailTabs', () => {
  it('routes the My Entries tab to MyEntriesTab for an exhibitor', () => {
    renderTabs({ activeTab: 'my-entries', canManageShow: false, isAuthenticated: true });
    expect(screen.getByTestId('my-entries-tab')).toBeInTheDocument();
  });

  it('does not render the My Entries tab content for an unauthenticated visitor', () => {
    renderTabs({ activeTab: 'my-entries', isAuthenticated: false });
    expect(screen.queryByTestId('my-entries-tab')).toBeNull();
  });

  it('has no manager entries body left to route to — Entries is a page now', () => {
    // MYK9-630 AC3 / MYK9-634: the manager's "Entries" tab and the exhibitor's
    // "My Entries" tab shared the id `my-entries`, so a cold `?tab=my-entries`
    // deep link mounted the EXHIBITOR body for a secretary while their club
    // scope resolved, and a click never did. One id, one body, one audience.
    renderTabs({ activeTab: 'my-entries', canManageShow: true, isAuthenticated: true });
    expect(screen.getByTestId('my-entries-tab')).toBeInTheDocument();
    expect(screen.queryByTestId('entries-tab')).toBeNull();
  });

  // DELETED, not kept: 'has no Show Map panel — Show Map is a view inside Setup
  // now'. It was vacuous and always had been. On `origin/main` the identical
  // assertion passed WHILE the component still rendered `<TabsContent
  // value="map">` under `canShowMap`, because the panel's child is
  // `React.lazy(...)` inside `<Suspense>`: the mocked module resolves on a
  // microtask and the synchronous `queryByTestId` never sees it either way. A
  // test that asserted the absence of something present, and was green, cannot
  // fail (REV-2341 lens Q, P3-Q4; LESSONS `mutation-actually-mutated`).
  //
  // The guards that DO red when the Show Map tab comes back are
  // `ShowDetailsPage.tabDefs.test.tsx` ("offers no Show Map to anyone") and
  // `ShowDetailsPage.test.tsx` ("has ONE Show Map — inside Setup"), both of
  // which assert on the tab strip and both of which were mutation-checked. The
  // panel's own read-only INTENT moved to Setup with it; see
  // `ShowWorkbenchSetupPage.test.tsx` ("renders the Show Map read-only").

  it('passes hideRing=true to ClassesTab when a scent-work trial is present', () => {
    renderTabs({ activeTab: 'classes', trials: [makeTrial({ trialType: 'Scent Work' })] });
    expect(screen.getByTestId('classes-tab')).toHaveAttribute('data-hide-ring', 'true');
  });

  it('passes hideRing=false when no scent-work trial is present', () => {
    renderTabs({ activeTab: 'classes', trials: [makeTrial({ trialType: 'Agility' })] });
    expect(screen.getByTestId('classes-tab')).toHaveAttribute('data-hide-ring', 'false');
  });

  it('wires the overview "view classes" action to onTabChange', () => {
    const onTabChange = vi.fn();
    renderTabs({ activeTab: 'overview', onTabChange });
    fireEvent.click(screen.getByTestId('overview-tab'));
    expect(onTabChange).toHaveBeenCalledWith('classes');
  });

  it('passes authenticated audience context to the Overview', () => {
    renderTabs({ activeTab: 'overview', isAuthenticated: true });
    expect(screen.getByTestId('overview-tab')).toHaveAttribute('data-authenticated', 'true');
  });
});
