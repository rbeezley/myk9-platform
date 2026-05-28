import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import ReportsPage, { resolveInitialReportId, resolveInitialReportScope } from '../index';

const showStoreMock = vi.hoisted(() => {
  const state = {
    selectedShowId: 'show-1',
    shows: [
      { id: 'show-1', name: 'Spring Scent Trial 2026' },
      { id: 'show-2', name: 'Summer Scent Trial 2026' },
    ],
    selectShow: vi.fn((showId: string) => {
      state.selectedShowId = showId;
    }),
  };
  return state;
});

vi.mock('@/store/showStore', () => ({
  useShowStore: () => ({
    selectedShowId: showStoreMock.selectedShowId,
    shows: showStoreMock.shows,
    selectShow: showStoreMock.selectShow,
  }),
}));

vi.mock('@/hooks/queries/useReportData', () => ({
  useReportData: () => ({
    show: { id: 'show-1', name: 'Spring Scent Trial 2026' },
    trials: [{ id: 'trial-1', trial_number: 1, date: '2026-04-12' }],
    classes: [
      {
        id: 'class-1',
        element: 'Buried',
        level: 'Novice',
        section: '',
        trial_id: 'trial-1',
      },
    ],
    entries: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('../ReportPreview', () => ({
  ReportPreview: () => <div data-testid="report-preview">Preview</div>,
}));

describe('ReportsPage', () => {
  beforeEach(() => {
    showStoreMock.selectedShowId = 'show-1';
    showStoreMock.selectShow.mockClear();
  });

  it('renders "Reports" title', () => {
    render(<ReportsPage />);
    expect(screen.getByText('Reports')).toBeInTheDocument();
  });

  it('renders Print button', () => {
    render(<ReportsPage />);
    expect(screen.getByRole('button', { name: /print/i })).toBeInTheDocument();
  });

  it('renders show name', () => {
    render(<ReportsPage />);
    expect(screen.getAllByText('Spring Scent Trial 2026').length).toBeGreaterThan(0);
  });

  it('applies a deep-linked show once without overriding later show changes', async () => {
    showStoreMock.selectedShowId = 'show-2';

    const { rerender } = render(<ReportsPage />, {
      initialRoute: '/secretary/reports?showId=show-1',
    });

    await waitFor(() => expect(showStoreMock.selectShow).toHaveBeenCalledWith('show-1'));

    showStoreMock.selectShow.mockClear();
    showStoreMock.selectedShowId = 'show-2';
    rerender(<ReportsPage />);

    await waitFor(() =>
      expect(screen.getAllByText('Summer Scent Trial 2026').length).toBeGreaterThan(0)
    );
    expect(showStoreMock.selectShow).not.toHaveBeenCalledWith('show-1');
  });
});

describe('resolveInitialReportId', () => {
  it('returns the default report when no query param is provided', () => {
    expect(resolveInitialReportId(null)).toBe('check-in-sheet');
  });

  it('returns the default report when query param is empty', () => {
    expect(resolveInitialReportId('')).toBe('check-in-sheet');
  });

  it('returns the requested report when it exists and is enabled', () => {
    expect(resolveInitialReportId('judge-supply-checklist')).toBe('judge-supply-checklist');
  });

  it('accepts a result catalog deep link for judge signature routing', () => {
    expect(resolveInitialReportId('result-catalog')).toBe('result-catalog');
  });

  it('falls back to default when the report id is unknown', () => {
    expect(resolveInitialReportId('not-a-real-report')).toBe('check-in-sheet');
  });
});

describe('resolveInitialReportScope', () => {
  it('uses all scopes when no query params are provided', () => {
    expect(resolveInitialReportScope(new URLSearchParams())).toEqual({
      showId: undefined,
      trialId: 'all',
      classId: 'all',
      dogId: 'all',
    });
  });

  it('keeps show, trial, class, and dog deep-link params', () => {
    const params = new URLSearchParams({
      showId: 'show-1',
      trialId: 'trial-1',
      classId: 'class-1',
      dogId: 'dog-1',
    });

    expect(resolveInitialReportScope(params)).toEqual({
      showId: 'show-1',
      trialId: 'trial-1',
      classId: 'class-1',
      dogId: 'dog-1',
    });
  });
});
