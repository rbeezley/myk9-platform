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
    expect(screen.getByText(/4\/12\/2026/)).toBeInTheDocument();
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

  it('prints the full AKC Event Operations ZIP+4 (matches the sibling secretary report)', () => {
    // Regression: this form had a truncated ZIP '27617' while TrialSecretaryReport
    // uses '27617-3390'. Two official AKC forms must not disagree on the address.
    render(<TrialChairmanReport {...baseProps} />);
    expect(screen.getByText(/Raleigh, NC 27617-3390/)).toBeInTheDocument();
  });
});

describe('TrialChairmanReport officials (MYK9-1386)', () => {
  const chairperson = {
    name: 'Casey Chair',
    streetAddress: null,
    city: null,
    state: null,
    zipCode: null,
    phone: '555-0100',
    email: 'casey@example.com',
  };

  it('prints the chairman name, telephone and email', () => {
    render(<TrialChairmanReport {...baseProps} officials={{ chairperson, secretary: null }} />);
    expect(screen.getByText('Casey Chair')).toBeInTheDocument();
    expect(screen.getByText('555-0100')).toBeInTheDocument();
    expect(screen.getByText('casey@example.com')).toBeInTheDocument();
  });

  it('keeps the blank lines when no chairman is read', () => {
    render(<TrialChairmanReport {...baseProps} officials={null} />);
    expect(screen.queryByText('Casey Chair')).not.toBeInTheDocument();
    expect(screen.getAllByText('___________________________')).toHaveLength(3);
  });
});
