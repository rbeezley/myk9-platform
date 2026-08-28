// apps/myk9show/src/pages/secretary/__tests__/ResultsControlPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import type { ShowSettings } from '@/hooks/queries/useShowSettingsDatabase';

const mockTrialStoreState = vi.hoisted(() => ({
  trials: [
    {
      id: 'trial-1',
      name: 'Trial A',
      showId: 'show-1',
      _version: 1,
      _lastModified: new Date(),
      _lastModifiedBy: '',
      _syncStatus: 'synced',
    },
  ],
}));

vi.mock('@/store/trialStore', () => ({
  useTrialStore: () => mockTrialStoreState,
}));

const mockClassStoreState = vi.hoisted(() => ({
  classes: [
    {
      id: 'class-1',
      trialId: 'trial-1',
      element: 'Standard',
      level: 'Novice',
      _version: 1,
      _lastModified: new Date(),
      _lastModifiedBy: '',
      _syncStatus: 'synced',
    },
    {
      id: 'class-2',
      trialId: 'trial-1',
      element: 'Standard',
      level: 'Open',
      _version: 1,
      _lastModified: new Date(),
      _lastModifiedBy: '',
      _syncStatus: 'synced',
    },
  ],
  entries: [
    {
      id: 'entry-1',
      classId: 'class-1',
      armband: '101',
      handler: 'Jane',
      dog: 'Ranger',
      status: 'pending',
      score: '',
      time: '',
      placement: '',
      _version: 1,
      _lastModified: new Date(),
      _lastModifiedBy: '',
      _syncStatus: 'synced',
    },
  ],
}));

vi.mock('@/store/classStore', () => ({
  useClassStore: () => mockClassStoreState,
}));

// --- Query mocks ---
const defaultSettings: ShowSettings = {
  visibility: {
    placement: 'class_complete',
    qualification: 'immediate',
    time: 'class_complete',
    faults: 'class_complete',
    inheritedFrom: 'show',
    preset: 'standard',
  },
  selfCheckinEnabled: true,
  hasExplicitSettings: true,
};

const fallbackSettings: ShowSettings = {
  visibility: {
    placement: 'class_complete',
    qualification: 'class_complete',
    time: 'class_complete',
    faults: 'class_complete',
    inheritedFrom: 'show',
    preset: 'standard',
  },
  selfCheckinEnabled: true,
  hasExplicitSettings: false,
};

// Mutable query state so individual tests can flip the hooks into a loading or
// error state. Reset in beforeEach to the success defaults.
const mockRefetch = vi.fn();
const mockQueryState = vi.hoisted(() => ({
  settings: undefined as ShowSettings | undefined,
  isLoading: false,
  isError: false,
}));

vi.mock('@/hooks/queries/useShowSettingsDatabase', () => ({
  useShowSettings: () => ({
    data: mockQueryState.settings,
    isLoading: mockQueryState.isLoading,
    isError: mockQueryState.isError,
    refetch: mockRefetch,
  }),
  useTrialOverrides: () => ({
    data: [],
    isLoading: mockQueryState.isLoading,
    isError: mockQueryState.isError,
    refetch: mockRefetch,
  }),
  useClassOverrides: () => ({
    data: [],
    isLoading: mockQueryState.isLoading,
    isError: mockQueryState.isError,
    refetch: mockRefetch,
  }),
  getDefaultShowSettings: () => fallbackSettings,
  settingsQueryKeys: {
    all: ['showSettings'],
    show: (id: string) => ['showSettings', 'show', id],
    trials: (id: string) => ['showSettings', 'trials', id],
    classOverrides: (id: string) => ['showSettings', 'classOverrides', id],
    classOverride: (id: string) => ['showSettings', 'class', id],
    trialOverride: (id: string) => ['showSettings', 'trial', id],
  },
}));

// --- Mutation mocks ---
const mockVisibilityMutate = vi.fn();
const mockTrialMutate = vi.fn();
const mockClassMutate = vi.fn();
const mockResetMutate = vi.fn();
const mockCheckinMutate = vi.fn();
vi.mock('@/hooks/mutations/useShowSettingsMutations', () => ({
  useUpdateShowVisibility: () => ({ mutate: mockVisibilityMutate, isPending: false }),
  useUpdateTrialOverride: () => ({ mutate: mockTrialMutate, isPending: false }),
  useUpdateClassOverride: () => ({ mutate: mockClassMutate, isPending: false }),
  useBulkUpdateClassOverrides: () => ({ mutate: mockClassMutate, isPending: false }),
  useResetOverride: () => ({ mutate: mockResetMutate, isPending: false }),
  useUpdateShowCheckin: () => ({ mutate: mockCheckinMutate, isPending: false }),
}));

vi.mock('@/hooks/mutations/useReleaseResults', () => ({
  useReleaseResults: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

import ResultsControlPage from '../ResultsControlPage';
import { Routes, Route } from 'react-router-dom';

function renderPage(initialRoute = '/shows/show-1/results-control') {
  return render(
    <Routes>
      <Route path="/shows/:id/results-control" element={<ResultsControlPage />} />
    </Routes>,
    { initialRoute }
  );
}

describe('ResultsControlPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default seeded query state (success)
    mockQueryState.settings = defaultSettings;
    mockQueryState.isLoading = false;
    mockQueryState.isError = false;
    // Restore default seeded state
    mockTrialStoreState.trials = [
      {
        id: 'trial-1',
        name: 'Trial A',
        showId: 'show-1',
        _version: 1,
        _lastModified: new Date(),
        _lastModifiedBy: '',
        _syncStatus: 'synced',
      },
    ];
    mockClassStoreState.classes = [
      {
        id: 'class-1',
        trialId: 'trial-1',
        element: 'Standard',
        level: 'Novice',
        _version: 1,
        _lastModified: new Date(),
        _lastModifiedBy: '',
        _syncStatus: 'synced',
      },
      {
        id: 'class-2',
        trialId: 'trial-1',
        element: 'Standard',
        level: 'Open',
        _version: 1,
        _lastModified: new Date(),
        _lastModifiedBy: '',
        _syncStatus: 'synced',
      },
    ];
    mockClassStoreState.entries = [
      {
        id: 'entry-1',
        classId: 'class-1',
        armband: '101',
        handler: 'Jane',
        dog: 'Ranger',
        status: 'pending',
        score: '',
        time: '',
        placement: '',
        _version: 1,
        _lastModified: new Date(),
        _lastModifiedBy: '',
        _syncStatus: 'synced',
      },
    ];
  });

  it('shows a results readiness summary above the settings', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Results readiness' })).toBeInTheDocument();
    expect(screen.getByTestId('results-readiness-verdict')).toHaveTextContent(
      "Here's what is still blocking closeout."
    );
    expect(screen.getByText((_content, element) => element?.textContent === '1 unscored entry'))
      .toBeInTheDocument();
    // Renamed: it is a navigation, not a download. The file lives on Submit
    // Results, and labelling a Link as a file action on the page whose job is
    // telling the truth about results was the wrong place to be loose.
    expect(screen.getByRole('link', { name: 'Go to Submit Results' })).toHaveAttribute(
      'href',
      '/shows/show-1/submit-results'
    );
  });

  it('renders page title', () => {
    renderPage();
    expect(screen.getByText('Results & Check-In')).toBeInTheDocument();
  });

  it('renders all three preset cards', () => {
    renderPage();
    expect(screen.getByText('Immediately')).toBeInTheDocument();
    expect(screen.getByText('After Class')).toBeInTheDocument();
    expect(screen.getByText('After Review')).toBeInTheDocument();
  });

  it('renders the show-level self check-in control', () => {
    renderPage();
    // The dedicated "Self Check-In" card was merged into the unified Results & Self
    // Check-In card; the show-level toggle now lives under "Show defaults".
    expect(
      screen.getByRole('switch', { name: 'Allow self check-in for show' })
    ).toBeInTheDocument();
  });

  it('clicking a preset calls the visibility mutation', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText('Immediately'));
    expect(mockVisibilityMutate).toHaveBeenCalledWith(
      expect.objectContaining({ preset: 'open' }),
      expect.any(Object)
    );
  });

  it('renders the UI correctly when the trial store is empty (deep-link / refresh)', () => {
    // Verifies that the shell-hoisted loadTrials() covers this route:
    // a cold load with no pre-hydrated store data must not crash or blank out
    // the preset cards — the React Query layer (show settings) is independent.
    mockTrialStoreState.trials = [];
    mockClassStoreState.classes = [];

    renderPage();

    expect(screen.getByText('Results & Check-In')).toBeInTheDocument();
    expect(screen.getByText('Immediately')).toBeInTheDocument();
    expect(screen.getByText('After Class')).toBeInTheDocument();
    expect(screen.getByText('After Review')).toBeInTheDocument();
    // Show-level check-in toggle renders even with no trials (independent of the tree).
    expect(
      screen.getByRole('switch', { name: 'Allow self check-in for show' })
    ).toBeInTheDocument();
  });

  it('shows the error state (not a perpetual skeleton) when the settings query errors', () => {
    // Regression: on error `isLoading` is false but `data` is undefined, so the
    // old `isLoading || !settings` gate fell into the skeleton forever. The gate
    // must distinguish error from loading.
    mockQueryState.settings = undefined;
    mockQueryState.isLoading = false;
    mockQueryState.isError = true;

    const { container } = renderPage();

    // Page-level error banner with a Retry affordance is shown.
    expect(screen.getByText('Failed to load results settings')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();

    // The cards surface an inline error, not the loading skeleton.
    expect(screen.getAllByText(/Couldn't load these settings/i).length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.animate-pulse').length).toBe(0);
  });

  it('clicking Retry refetches the errored queries', async () => {
    mockQueryState.settings = undefined;
    mockQueryState.isLoading = false;
    mockQueryState.isError = true;

    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('shows the loading skeleton while queries are in flight', () => {
    mockQueryState.settings = undefined;
    mockQueryState.isLoading = true;
    mockQueryState.isError = false;

    const { container } = renderPage();

    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Couldn't load these settings/i)).not.toBeInTheDocument();
  });

  it('falls back to default settings when the query is idle (no data, no error)', () => {
    // The queries are `enabled: !!showId`, so an empty showId leaves them idle:
    // isLoading=false, isError=false, data=undefined. The content branch must
    // render with default settings (via `settings ?? getDefaultShowSettings()`)
    // rather than the skeleton or the error state.
    mockQueryState.settings = undefined;
    mockQueryState.isLoading = false;
    mockQueryState.isError = false;

    const { container } = renderPage();

    // Content branch is active: preset cards render, no skeleton, no error.
    expect(screen.getByText('Immediately')).toBeInTheDocument();
    expect(screen.getByText('After Class')).toBeInTheDocument();
    expect(container.querySelectorAll('.animate-pulse').length).toBe(0);
    expect(screen.queryByText(/Couldn't load these settings/i)).not.toBeInTheDocument();
  });
});
