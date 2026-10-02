import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import { Route, Routes, Outlet, useLocation } from 'react-router-dom';
import { ShowWorkbenchSetupPage } from './ShowWorkbenchSetupPage';
import { resolveSetupSection } from './showSetupSections';
import type { ShowDetailTabsProps } from '@/components/shows/ShowDetails/ShowDetailTabs';

vi.mock('@/components/shows/tabs/TrialsTab', () => ({
  TrialsTab: () => <div data-testid="trials-view" />,
}));
vi.mock('@/components/shows/tabs/ClassesTab', () => ({
  ClassesTab: ({
    viewId,
    trialId,
    focusClassId,
    onViewChange,
    onTrialChange,
  }: {
    viewId: string;
    trialId: string | null;
    focusClassId: string | null;
    onViewChange: (viewId: string) => void;
    onTrialChange: (trialId: string) => void;
  }) => (
    <div
      data-testid="classes-view"
      data-view={viewId}
      data-trial={trialId ?? ''}
      data-focus={focusClassId ?? ''}
    >
      <button onClick={() => onViewChange('completed')}>pick completed</button>
      <button onClick={() => onViewChange('all')}>pick all</button>
      <button onClick={() => onTrialChange('t2')}>pick trial 2</button>
    </div>
  ),
}));
vi.mock('@/features/show-map/ShowMapTab', () => ({
  default: ({ canManageShow }: { canManageShow: boolean }) => (
    <div data-testid="map-view" data-can-manage={String(canManageShow)} />
  ),
}));

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="probe-url">{`${location.pathname}${location.search}`}</span>;
}

function outletContext(overrides: Partial<ShowDetailTabsProps> = {}): ShowDetailTabsProps {
  return {
    show: { id: 'show-1', name: 'Heartland' } as ShowDetailTabsProps['show'],
    tabs: [],
    activeTab: 'overview',
    onTabChange: vi.fn(),
    canManageShow: true,
    canShowMap: true,
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
}

function renderSetup(
  initialRoute = '/shows/show-1/setup',
  overrides: Partial<ShowDetailTabsProps> = {}
) {
  return render(
    <Routes>
      <Route
        path="/shows/:id"
        element={
          <>
            <LocationProbe />
            <Outlet context={outletContext(overrides)} />
          </>
        }
      >
        <Route path="setup" element={<ShowWorkbenchSetupPage />} />
      </Route>
    </Routes>,
    { initialRoute }
  );
}

describe('ShowWorkbenchSetupPage', () => {
  it('opens on Trials', async () => {
    renderSetup();
    expect(await screen.findByTestId('trials-view')).toBeInTheDocument();
  });

  it('offers Trials, Classes and Show Map as a segmented control, not a second tab row', async () => {
    // INTENT: the six show tabs are the ONE horizontal tab row on this page.
    // These three are pressed buttons inside its body, so a secretary can tell
    // at a glance which row is navigation and which is a filter.
    renderSetup();
    const group = await screen.findByRole('group', { name: /setup section/i });
    expect(group).toBeInTheDocument();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(
      screen.getAllByRole('button', { name: /^(Trials|Classes|Show Map)$/ }).map(b => b.textContent)
    ).toEqual(['Trials', 'Classes', 'Show Map']);
  });

  it('renders the view the URL names on a cold load', async () => {
    renderSetup('/shows/show-1/setup?section=classes');
    expect(await screen.findByTestId('classes-view')).toBeInTheDocument();
    expect(screen.queryByTestId('trials-view')).toBeNull();
  });

  it('writes the chosen view into the URL so it can be shared and reloaded', async () => {
    renderSetup();
    await userEvent.click(screen.getByRole('button', { name: 'Show Map' }));
    expect(await screen.findByTestId('map-view')).toBeInTheDocument();
    expect(screen.getByTestId('probe-url').textContent).toBe('/shows/show-1/setup?section=map');
  });

  describe('Classes section URL state', () => {
    it('reads the view, trial and focus from the URL', async () => {
      renderSetup('/shows/show-1/setup?section=classes&view=pending&trialId=t1&focus=c9');
      const classes = await screen.findByTestId('classes-view');
      expect(classes).toHaveAttribute('data-view', 'pending');
      expect(classes).toHaveAttribute('data-trial', 't1');
      expect(classes).toHaveAttribute('data-focus', 'c9');
    });

    it('reads an unknown view as All', async () => {
      renderSetup('/shows/show-1/setup?section=classes&view=nonsense');
      expect(await screen.findByTestId('classes-view')).toHaveAttribute('data-view', 'all');
    });

    it('writes a picked view into the URL, drops the one-shot focus, and keeps the rest', async () => {
      renderSetup('/shows/show-1/setup?section=classes&trialId=t1&focus=c9');
      await userEvent.click(await screen.findByRole('button', { name: 'pick completed' }));
      expect(screen.getByTestId('probe-url').textContent).toBe(
        '/shows/show-1/setup?section=classes&trialId=t1&view=completed'
      );
      expect(screen.getByTestId('classes-view')).toHaveAttribute('data-view', 'completed');
    });

    it('takes the view out of the URL when All is picked', async () => {
      renderSetup('/shows/show-1/setup?section=classes&view=completed');
      await userEvent.click(await screen.findByRole('button', { name: 'pick all' }));
      expect(screen.getByTestId('probe-url').textContent).toBe(
        '/shows/show-1/setup?section=classes'
      );
    });

    it('writes a picked trial into the URL', async () => {
      renderSetup('/shows/show-1/setup?section=classes');
      await userEvent.click(await screen.findByRole('button', { name: 'pick trial 2' }));
      expect(screen.getByTestId('probe-url').textContent).toBe(
        '/shows/show-1/setup?section=classes&trialId=t2'
      );
    });

    it('does not carry the Classes view, trial or focus to the other sections', async () => {
      renderSetup(
        '/shows/show-1/setup?section=classes&view=completed&trialId=t1&focus=c9&returnTo=%2Fshows%2Fshow-1%2Fshow-day'
      );
      await userEvent.click(await screen.findByRole('button', { name: 'Trials' }));
      expect(screen.getByTestId('probe-url').textContent).toBe(
        '/shows/show-1/setup?returnTo=%2Fshows%2Fshow-1%2Fshow-day'
      );
      await userEvent.click(screen.getByRole('button', { name: 'Classes' }));
      expect(await screen.findByTestId('classes-view')).toHaveAttribute('data-view', 'all');
    });
  });

  describe('Show Desk return link', () => {
    it('offers the way back when the Show Desk sent the secretary here', async () => {
      renderSetup(
        '/shows/show-1/setup?section=classes&returnTo=%2Fshows%2Fshow-1%2Fshow-day%3Ffilter%3Din-progress'
      );
      const link = await screen.findByRole('link', { name: /back to show desk/i });
      expect(link).toHaveAttribute('href', '/shows/show-1/show-day?filter=in-progress');
    });

    it('offers nothing when the visit did not come from the Show Desk', async () => {
      renderSetup('/shows/show-1/setup?section=classes');
      await screen.findByTestId('classes-view');
      expect(screen.queryByRole('link', { name: /back to show desk/i })).toBeNull();
    });
  });

  it('hides Show Map, and never selects it, when the viewer cannot see one', async () => {
    renderSetup('/shows/show-1/setup?section=map', { canShowMap: false });
    expect(screen.queryByRole('button', { name: 'Show Map' })).toBeNull();
    expect(await screen.findByTestId('trials-view')).toBeInTheDocument();
  });

  it('renders the Show Map read-only, managers included', async () => {
    // INTENT: view-only for everyone on the show page. Decided by #291 ("make
    // public map read-only") and re-affirmed as an architectural commitment by
    // the workbench collapse. The manager action layer lives on Show Day
    // (ShowDeskPanel), not here. This assertion was broken once on the theory
    // that the row actions were unreachable app-wide; they are not. Do not
    // "fix" it to true.
    renderSetup('/shows/show-1/setup?section=map');
    expect(await screen.findByTestId('map-view')).toHaveAttribute('data-can-manage', 'false');
  });
});

describe('resolveSetupSection', () => {
  it('falls back to Trials for an unknown section', () => {
    expect(resolveSetupSection('nonsense', true)).toBe('trials');
  });

  it('refuses map when the viewer has no map', () => {
    expect(resolveSetupSection('map', false)).toBe('trials');
  });
});
