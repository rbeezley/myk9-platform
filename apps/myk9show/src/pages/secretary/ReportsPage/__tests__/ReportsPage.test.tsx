import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import ReportsPage from '../index';

vi.mock('@/store/showStore', () => ({
  useShowStore: () => ({
    selectedShowId: 'show-1',
    shows: [{ id: 'show-1', name: 'Spring Scent Trial 2026' }],
    selectShow: vi.fn(),
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
});
