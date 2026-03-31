/**
 * Component tests for ShowSettingsPage.
 *
 * Tests the summary card layout and navigation links.
 * All data hooks and navigation are mocked.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// --- Navigation mock ---

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// --- Store mocks ---

const mockSelectedShowId = { value: 'show-1' };
const mockShows = [{ id: 'show-1', name: 'Test Show 2026' }];

vi.mock('@/store/showStore', () => ({
  useShowStore: (selector?: (s: Record<string, unknown>) => unknown) => {
    const state = {
      selectedShowId: mockSelectedShowId.value,
      shows: mockShows,
    };
    return selector ? selector(state) : state;
  },
}));

// --- Query hook mocks ---

const mockUseShowSettings = vi.fn();

vi.mock('@/hooks/queries/useShowSettingsDatabase', () => ({
  useShowSettings: (...args: unknown[]) => mockUseShowSettings(...args),
}));

// --- Import component after mocks ---

import ShowSettingsPage from '@/pages/secretary/ShowSettingsPage/index';

// --- Helpers ---

function makeSettings(overrides: Partial<{ preset: string; selfCheckinEnabled: boolean }> = {}) {
  return {
    visibility: {
      placement: 'class_complete' as const,
      qualification: 'immediate' as const,
      time: 'class_complete' as const,
      faults: 'class_complete' as const,
      inheritedFrom: 'show' as const,
      preset: (overrides.preset ?? 'standard') as 'open' | 'standard' | 'review',
    },
    selfCheckinEnabled: overrides.selfCheckinEnabled ?? true,
    hasExplicitSettings: true,
  };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ShowSettingsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// --- Tests ---

describe('ShowSettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectedShowId.value = 'show-1';

    mockUseShowSettings.mockReturnValue({
      data: makeSettings(),
      isLoading: false,
    });
  });

  describe('no show selected', () => {
    it('shows empty-state prompt when no show is selected', () => {
      mockSelectedShowId.value = '';
      renderPage();
      expect(screen.getByText(/select a show/i)).toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('renders skeleton placeholders while query is loading', () => {
      mockUseShowSettings.mockReturnValue({ data: undefined, isLoading: true });

      const { container } = renderPage();
      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('summary cards', () => {
    it('shows section headings for Results Visibility and Self Check-In', () => {
      renderPage();
      expect(screen.getByText('Results Visibility')).toBeInTheDocument();
      expect(screen.getByText('Self Check-In')).toBeInTheDocument();
    });

    it('shows preset label "After Class" for standard preset', () => {
      renderPage();
      expect(screen.getByText(/after class/i)).toBeInTheDocument();
    });

    it('shows preset label "Immediately" for open preset', () => {
      mockUseShowSettings.mockReturnValue({
        data: makeSettings({ preset: 'open' }),
        isLoading: false,
      });
      renderPage();
      expect(screen.getByText(/immediately/i)).toBeInTheDocument();
    });

    it('shows preset label "After Review" for review preset', () => {
      mockUseShowSettings.mockReturnValue({
        data: makeSettings({ preset: 'review' }),
        isLoading: false,
      });
      renderPage();
      expect(screen.getByText(/after review/i)).toBeInTheDocument();
    });

    it('shows "Enabled" when selfCheckinEnabled is true', () => {
      renderPage();
      expect(screen.getByText('Enabled')).toBeInTheDocument();
    });

    it('shows "Disabled" when selfCheckinEnabled is false', () => {
      mockUseShowSettings.mockReturnValue({
        data: makeSettings({ selfCheckinEnabled: false }),
        isLoading: false,
      });
      renderPage();
      expect(screen.getByText('Disabled')).toBeInTheDocument();
    });

    it('renders two Manage buttons', () => {
      renderPage();
      expect(screen.getAllByRole('button', { name: /manage/i })).toHaveLength(2);
    });
  });

  describe('show name display', () => {
    it('displays the selected show name as a subtitle', () => {
      renderPage();
      expect(screen.getByText('Test Show 2026')).toBeInTheDocument();
    });
  });
});
