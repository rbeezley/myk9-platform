import { render, screen } from '@testing-library/react';
import { AKCJudgeReport } from '../AKCJudgeReport';
import type { ReportProps } from '@/lib/reports/types';

const baseProps: ReportProps = {
  showName: 'Spring Scent Trial 2026',
  organization: 'AKC',
  clubName: 'Twin Cities Dog Club',
  sortOrder: '',
  entries: [],
  trial: { date: '2026-04-12', trialNumber: '1', judgeName: 'Dr. Jane Smith' },
  allClasses: [
    { id: 'c1', trialId: 't1', element: 'Container', level: 'Novice', judgeName: 'Dr. Jane Smith' },
  ],
};

describe('AKCJudgeReport', () => {
  it('renders report title', () => {
    render(<AKCJudgeReport {...baseProps} />);
    expect(screen.getByText(/Judge.s Report/i)).toBeInTheDocument();
  });

  it('renders judge name in header', () => {
    render(<AKCJudgeReport {...baseProps} />);
    expect(screen.getByText(/Dr. Jane Smith/i)).toBeInTheDocument();
  });

  it('renders trial date in header', () => {
    render(<AKCJudgeReport {...baseProps} />);
    expect(screen.getByText(/04\/12\/2026/)).toBeInTheDocument();
  });

  it('renders at least one yes/no question with checkboxes', () => {
    render(<AKCJudgeReport {...baseProps} />);
    const yesCheckboxes = screen.getAllByText(/☐ Yes/);
    expect(yesCheckboxes.length).toBeGreaterThan(0);
  });

  it('renders a signature line', () => {
    render(<AKCJudgeReport {...baseProps} />);
    expect(screen.getByText(/Judge.s Signature/i)).toBeInTheDocument();
  });
});
