import { render, screen } from '@testing-library/react';
import { TrialChairmanReport } from '../TrialChairmanReport';
import type { ReportProps } from '@/lib/reports/types';

const baseProps: ReportProps = {
  showName: 'Spring Scent Trial 2026',
  clubName: 'Norwegian Elkhound Association of America',
  organization: 'AKC',
  sortOrder: '',
  trial: { date: '2026-04-12', trialNumber: '1', judgeName: 'Dr. Jane Smith' },
  entries: [],
};

describe('TrialChairmanReport', () => {
  it('renders report title', () => {
    render(<TrialChairmanReport {...baseProps} />);
    expect(screen.getByText(/Trial Chair.?s Report/i)).toBeInTheDocument();
  });

  it('shows club name', () => {
    render(<TrialChairmanReport {...baseProps} />);
    expect(screen.getByText('Norwegian Elkhound Association of America')).toBeInTheDocument();
  });

  it('shows judge name', () => {
    render(<TrialChairmanReport {...baseProps} />);
    expect(screen.getByText('Dr. Jane Smith')).toBeInTheDocument();
  });

  it('shows trial date', () => {
    render(<TrialChairmanReport {...baseProps} />);
    expect(screen.getByText(/04\/12\/2026/)).toBeInTheDocument();
  });

  it('includes demo dog question', () => {
    render(<TrialChairmanReport {...baseProps} />);
    expect(screen.getByText(/Demo Dog/i)).toBeInTheDocument();
  });

  it('includes dog aggression question', () => {
    render(<TrialChairmanReport {...baseProps} />);
    expect(screen.getByText(/Dog Aggression/i)).toBeInTheDocument();
  });

  it('includes misconduct question', () => {
    render(<TrialChairmanReport {...baseProps} />);
    expect(screen.getByText(/Misconduct/i)).toBeInTheDocument();
  });

  it('renders signature line', () => {
    render(<TrialChairmanReport {...baseProps} />);
    expect(screen.getByText(/Trial Chair/i)).toBeInTheDocument();
  });
});
