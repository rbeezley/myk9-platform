import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ShowDetailTabs, type ShowDetailTabsProps } from '../ShowDetailTabs';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import { LayoutDashboard } from 'lucide-react';

// Stub the tab content components — this suite verifies ShowDetailTabs' OWN
// branching (which content each tab shows, gating), not the children themselves.
vi.mock('@/components/shows/tabs/ShowOverviewTab', () => ({
  ShowOverviewTab: ({ onViewClasses }: { onViewClasses: () => void }) => (
    <button data-testid="overview-tab" onClick={onViewClasses}>
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
vi.mock('@/components/shows/ShowDetails/EntriesTab', () => ({
  EntriesTab: () => <div data-testid="entries-tab">entries</div>,
}));
vi.mock('@/components/analytics/MyShowStatsTab', () => ({
  MyShowStatsTab: () => <div data-testid="my-stats-tab">my stats</div>,
}));
vi.mock('@/components/results/ShowResultsTab', () => ({
  ShowResultsTab: () => <div data-testid="results-tab">results</div>,
}));
vi.mock('@/features/show-map/ShowMapTab', () => ({
  default: ({ canManageShow }: { canManageShow: boolean }) => (
    <div data-testid="show-map-tab" data-can-manage={String(canManageShow)}>
      map
    </div>
  ),
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
    canShowMap: false,
    isAuthenticated: true,
    hasUserEntries: false,
    judges: [],
    classes: [],
    trials: [],
    trialStats: {},
    mapTrials: [],
    mapClasses: [],
    mapEntries: [],
    ...overrides,
  };
  return { props, ...render(<ShowDetailTabs {...props} />) };
}

describe('ShowDetailTabs', () => {
  it('routes the My Entries tab to MyEntriesTab for a non-manager', () => {
    renderTabs({ activeTab: 'my-entries', canManageShow: false, isAuthenticated: true });
    expect(screen.getByTestId('my-entries-tab')).toBeInTheDocument();
    expect(screen.queryByTestId('entries-tab')).toBeNull();
  });

  it('routes the My Entries tab to the manager EntriesTab for a manager', () => {
    renderTabs({ activeTab: 'my-entries', canManageShow: true, isAuthenticated: true });
    expect(screen.getByTestId('entries-tab')).toBeInTheDocument();
    expect(screen.queryByTestId('my-entries-tab')).toBeNull();
  });

  it('does not render the My Entries tab content for an unauthenticated visitor', () => {
    renderTabs({ activeTab: 'my-entries', isAuthenticated: false });
    expect(screen.queryByTestId('my-entries-tab')).toBeNull();
    expect(screen.queryByTestId('entries-tab')).toBeNull();
  });

  it('renders the Show Map (read-only) only when canShowMap is true', async () => {
    renderTabs({ activeTab: 'map', canShowMap: true, canManageShow: true });
    const map = await screen.findByTestId('show-map-tab');
    // The shell always renders the map read-only, even for managers.
    expect(map).toHaveAttribute('data-can-manage', 'false');
  });

  it('omits the Show Map content when canShowMap is false', () => {
    renderTabs({ activeTab: 'map', canShowMap: false });
    expect(screen.queryByTestId('show-map-tab')).toBeNull();
  });

  it('gates My Stats behind manager + authenticated', () => {
    renderTabs({ activeTab: 'my-stats', canManageShow: false, isAuthenticated: true });
    expect(screen.queryByTestId('my-stats-tab')).toBeNull();
    renderTabs({ activeTab: 'my-stats', canManageShow: true, isAuthenticated: true });
    expect(screen.getByTestId('my-stats-tab')).toBeInTheDocument();
  });

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
});
