// apps/myk9show/src/pages/secretary/__tests__/ResultsControlPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import type { ShowSettings } from '@/hooks/queries/useShowSettingsDatabase';

// --- Store mocks ---
const mockShowStoreState = vi.hoisted(() => {
  const state = {
    selectedShowId: 'show-1',
    shows: [
      { id: 'show-1', name: 'Spring Agility Trial' },
      { id: 'show-2', name: 'Fall Classic' },
    ],
    selectShow: vi.fn((showId: string) => {
      state.selectedShowId = showId;
    }),
  };
  return state;
});

const mockSelectShow = mockShowStoreState.selectShow;

const resetShowStore = () => {
  mockShowStoreState.selectedShowId = 'show-1';
  mockShowStoreState.shows = [
    { id: 'show-1', name: 'Spring Agility Trial' },
    { id: 'show-2', name: 'Fall Classic' },
  ];
};

vi.mock('@/store/showStore', () => ({
  useShowStore: () => ({
    selectedShowId: mockShowStoreState.selectedShowId,
    shows: mockShowStoreState.shows,
    selectShow: mockShowStoreState.selectShow,
  }),
}));

vi.mock('@/store/trialStore', () => ({
  useTrialStore: () => ({
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
  }),
}));

vi.mock('@/store/classStore', () => ({
  useClassStore: () => ({
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
  }),
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

vi.mock('@/hooks/queries/useShowSettingsDatabase', () => ({
  useShowSettings: () => ({ data: defaultSettings, isLoading: false }),
  useTrialOverrides: () => ({ data: [], isLoading: false }),
  useClassOverrides: () => ({ data: [], isLoading: false }),
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

function renderPage(initialRoute = '/secretary/results-control') {
  return render(<ResultsControlPage />, { initialRoute });
}

describe('ResultsControlPage', () => {
  beforeEach(() => {
    resetShowStore();
    vi.clearAllMocks();
  });

  it('renders page title and show name', () => {
    renderPage();
    expect(screen.getByText('Results Control')).toBeInTheDocument();
    expect(screen.getByText('Spring Agility Trial')).toBeInTheDocument();
  });

  it('renders all three preset cards', () => {
    renderPage();
    expect(screen.getByText('Immediately')).toBeInTheDocument();
    expect(screen.getByText('After Class')).toBeInTheDocument();
    expect(screen.getByText('After Review')).toBeInTheDocument();
  });

  it('renders self check-in section', () => {
    renderPage();
    expect(screen.getByText('Self Check-In')).toBeInTheDocument();
  });

  it('selects the route show when ?showId exists', async () => {
    renderPage('/secretary/results-control?showId=show-2');

    await waitFor(() => expect(mockSelectShow).toHaveBeenCalledWith('show-2'));
  });

  it('applies the route show once without overriding later show changes', async () => {
    const { rerender } = renderPage('/secretary/results-control?showId=show-2');

    await waitFor(() => expect(mockSelectShow).toHaveBeenCalledWith('show-2'));
    expect(mockShowStoreState.selectedShowId).toBe('show-2');

    mockSelectShow.mockClear();
    mockShowStoreState.selectedShowId = 'show-1';
    rerender(<ResultsControlPage />);

    await waitFor(() => expect(screen.getByText('Spring Agility Trial')).toBeInTheDocument());
    expect(mockSelectShow).not.toHaveBeenCalledWith('show-2');
  });

  it('keeps the selected show when ?showId is invalid', () => {
    mockShowStoreState.selectedShowId = 'show-2';

    renderPage('/secretary/results-control?showId=missing-show');

    expect(mockSelectShow).not.toHaveBeenCalledWith('missing-show');
    expect(mockSelectShow).not.toHaveBeenCalledWith('show-1');
    expect(screen.getByText('Fall Classic')).toBeInTheDocument();
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

  it('shows no-show state when no show selected', () => {
    mockShowStoreState.selectedShowId = '';
    mockShowStoreState.shows = [];
    renderPage();
    expect(screen.getByText(/select a show/i)).toBeInTheDocument();
    mockShowStoreState.selectedShowId = 'show-1'; // reset
  });
});
