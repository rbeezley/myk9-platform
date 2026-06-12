import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import ReportsPage, { resolveInitialReportId, resolveInitialReportScope } from '../index';

vi.mock('@/hooks/useFastShowDetails', () => ({
  useFastShowDetails: () => ({
    show: { id: 'show-1', name: 'Spring Scent Trial 2026' },
    isLoading: false,
    isError: false,
    hasData: true,
  }),
}));

vi.mock('@/hooks/queries/useReportData', () => ({
  useReportData: () => ({
    show: { id: 'show-1', name: 'Spring Scent Trial 2026' },
    trials: [
      { id: 'trial-1', trial_number: 1, date: '2026-04-12' },
      { id: 'trial-2', trial_number: 2, date: '2026-04-13' },
    ],
    classes: [
      {
        id: 'class-1',
        element: 'Buried',
        level: 'Novice',
        section: '',
        trial_id: 'trial-1',
      },
      {
        id: 'class-2',
        element: 'Interior',
        level: 'Advanced',
        section: '',
        trial_id: 'trial-2',
      },
    ],
    entries: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('../ReportPreview', () => ({
  ReportPreview: (props: { trialId: string; classId: string }) => (
    <div data-testid="report-preview" data-trial-id={props.trialId} data-class-id={props.classId}>
      Preview
    </div>
  ),
}));

describe('ReportsPage', () => {
  it('renders "Reports" title', () => {
    render(<ReportsPage />, { initialRoute: '/shows/show-1/reports' });
    expect(screen.getByText('Reports')).toBeInTheDocument();
  });

  it('renders Print button', () => {
    render(<ReportsPage />, { initialRoute: '/shows/show-1/reports' });
    expect(screen.getByRole('button', { name: /print/i })).toBeInTheDocument();
  });

  it('resets stale class scope when the trial changes', async () => {
    const user = userEvent.setup();

    render(<ReportsPage />, {
      initialRoute:
        '/shows/show-1/reports?report=result-catalog&trialId=trial-1&classId=class-1',
    });

    expect(screen.getByTestId('report-preview')).toHaveAttribute('data-class-id', 'class-1');

    const trialSelect = screen.getByRole('combobox', { name: /select trial/i });
    await user.click(trialSelect);
    await user.click(await screen.findByRole('option', { name: /Trial 2/ }));

    await waitFor(() =>
      expect(screen.getByTestId('report-preview')).toHaveAttribute('data-trial-id', 'trial-2')
    );
    expect(screen.getByTestId('report-preview')).toHaveAttribute('data-class-id', 'all');
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
      trialId: 'all',
      classId: 'all',
      dogId: 'all',
    });
  });

  it('keeps trial, class, and dog deep-link params', () => {
    const params = new URLSearchParams({
      trialId: 'trial-1',
      classId: 'class-1',
      dogId: 'dog-1',
    });

    expect(resolveInitialReportScope(params)).toEqual({
      trialId: 'trial-1',
      classId: 'class-1',
      dogId: 'dog-1',
    });
  });
});
