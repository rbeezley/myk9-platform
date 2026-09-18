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
  ClassesTab: () => <div data-testid="classes-view" />,
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
