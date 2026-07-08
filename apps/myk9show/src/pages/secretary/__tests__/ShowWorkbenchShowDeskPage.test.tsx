import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShowWorkbenchShowDeskPage } from '@/pages/secretary/ShowWorkbenchShowDeskPage';

const getEntriesForShowMock = vi.hoisted(() => vi.fn());

vi.mock('@/components/common/LoadingSkeleton', () => ({
  LoadingSkeleton: () => <div data-testid="loading-skeleton" />,
}));

vi.mock('@/hooks/useFastShowDetails', () => ({
  useFastShowDetails: () => ({
    show: { id: 'show-1', name: 'Bluegrass Classic', startDate: '2026-03-22' },
    isLoading: false,
  }),
}));

vi.mock('@/services/database/entries', () => ({
  getEntriesForShow: getEntriesForShowMock,
}));

vi.mock('@/hooks/queries/useShowJudges', () => ({
  useShowJudges: () => ({ data: [] }),
}));

vi.mock('@/hooks/mutations/useResultSubmission', () => ({
  useResultSubmissions: () => ({ data: [] }),
}));

vi.mock('@/services/database/show-incidents', () => ({
  showIncidentCloseoutQueryKey: (showId: string) => ['show-incidents', showId],
  listShowIncidentCloseout: vi.fn(async () => []),
}));

vi.mock('@/features/show-workbench/useJudgeHospitalityReminderCount', () => ({
  useJudgeHospitalityReminderCount: () => 0,
}));

vi.mock('@/hooks/queries/useSecretaryTasks', () => ({
  useSecretaryTasks: () => ({ data: [] }),
}));

vi.mock('@/store/trialStore', () => ({
  useTrialStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ trials: [], trialClasses: {} }),
}));

vi.mock('@/features/show-map/ShowDeskPanel', () => ({
  default: () => <div data-testid="show-desk-panel">Show Desk Panel</div>,
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/shows/show-1/show-desk']}>
        <Routes>
          <Route path="/shows/:id/show-desk" element={<ShowWorkbenchShowDeskPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ShowWorkbenchShowDeskPage', () => {
  beforeEach(() => {
    getEntriesForShowMock.mockReset();
  });

  it('holds Show Desk while entries are loading so counts cannot render as false zero', () => {
    getEntriesForShowMock.mockReturnValue(new Promise(() => undefined));

    renderPage();

    expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('show-desk-panel')).not.toBeInTheDocument();
  });
});
