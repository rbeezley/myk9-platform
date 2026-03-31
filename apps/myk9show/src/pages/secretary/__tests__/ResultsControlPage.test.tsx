// apps/myk9show/src/pages/secretary/__tests__/ResultsControlPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ShowSettings } from '@/hooks/queries/useShowSettingsDatabase';

// --- Store mocks ---
const mockSelectedShowId = { value: 'show-1' };
vi.mock('@/store/showStore', () => ({
  useShowStore: () => ({
    selectedShowId: mockSelectedShowId.value,
    shows: [{ id: 'show-1', name: 'Spring Agility Trial' }],
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

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ResultsControlPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ResultsControlPage', () => {
  beforeEach(() => vi.clearAllMocks());

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
    mockSelectedShowId.value = '';
    renderPage();
    expect(screen.getByText(/select a show/i)).toBeInTheDocument();
    mockSelectedShowId.value = 'show-1'; // reset
  });
});
