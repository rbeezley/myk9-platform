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
vi.mock('@/components/shows/ShowDetails/EntriesTab', () => ({
  EntriesTab: () => <div data-testid="entries-tab">entries</div>,
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

  it('forwards canManageShow to the Show Map so managers get its row actions', async () => {
    // CHANGED (secretary task walk, 2026-08-28). This previously asserted
    // `data-can-manage="false"` with the comment "the shell always renders the map
    // read-only, even for managers" -- a property #1035 inherited and preserved
    // during a refactor ("stays read-only"), not a stated product decision.
    //
    // The consequence was that `ShowMapRowActionsMenu` -- Move up, Pull / no-show,
    // Mark checked in, Edit score -- and the run-order reorder mode were
    // unreachable ANYWHERE, because this is the only mount of `ShowMapTab` in the
    // app. Two responsibilities in docs/roles/secretary.md ("manage class changes
    // and move-ups", "publish the running order") therefore had no UI at all.
    // ShowDetailTabs' own doc comment already says the management surface passes
    // this true "to light up the Show Map".
    renderTabs({ activeTab: 'map', canShowMap: true, canManageShow: true });
    const map = await screen.findByTestId('show-map-tab');
    expect(map).toHaveAttribute('data-can-manage', 'true');
  });

  it('keeps the Show Map read-only for the exhibitor surface', async () => {
    // The exhibitor view passes canManageShow=false; forwarding must not hand
    // exhibitors the manager action menu.
    renderTabs({ activeTab: 'map', canShowMap: true, canManageShow: false });
    const map = await screen.findByTestId('show-map-tab');
    expect(map).toHaveAttribute('data-can-manage', 'false');
  });

  it('omits the Show Map content when canShowMap is false', () => {
    renderTabs({ activeTab: 'map', canShowMap: false });
    expect(screen.queryByTestId('show-map-tab')).toBeNull();
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

  it('passes authenticated audience context to the Overview', () => {
    renderTabs({ activeTab: 'overview', isAuthenticated: true });
    expect(screen.getByTestId('overview-tab')).toHaveAttribute('data-authenticated', 'true');
  });
});
