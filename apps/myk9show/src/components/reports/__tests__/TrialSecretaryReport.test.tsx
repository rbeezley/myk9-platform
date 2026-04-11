import { render, screen } from '@testing-library/react';
import { TrialSecretaryReport } from '../TrialSecretaryReport';
import type { ReportProps } from '@/lib/reports/types';

const baseProps: ReportProps = {
  showName: 'Spring Scent Trial 2026',
  clubName: 'Norwegian Elkhound Association of America',
  organization: 'AKC',
  sortOrder: '',
  trial: { date: '2026-04-12', trialNumber: '1', judgeName: 'Dr. Jane Smith' },
  entries: Array.from({ length: 12 }, (_, i) => ({
    id: `e${i}`,
    armband: 100 + i,
    runOrder: i + 1,
    callName: `Dog ${i}`,
    breed: 'Breed',
    handler: 'Handler',
    registrationNumber: null,
    checkInStatus: null,
    section: null,
    isScored: true,
    resultText: 'Q',
    searchTimeSeconds: null,
    totalFaults: 0,
    finalPlacement: 1,
  })),
};

describe('TrialSecretaryReport', () => {
  it('renders report title', () => {
    render(<TrialSecretaryReport {...baseProps} />);
    expect(screen.getByText(/Report of Scent Work Trial/i)).toBeInTheDocument();
  });

  it('shows club name', () => {
    render(<TrialSecretaryReport {...baseProps} />);
    expect(screen.getByText('Norwegian Elkhound Association of America')).toBeInTheDocument();
  });

  it('shows trial date', () => {
    render(<TrialSecretaryReport {...baseProps} />);
    expect(screen.getByText(/4\/12\/2026/)).toBeInTheDocument();
  });

  it('shows entry count', () => {
    render(<TrialSecretaryReport {...baseProps} />);
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('shows judge name', () => {
    render(<TrialSecretaryReport {...baseProps} />);
    expect(screen.getByText('Dr. Jane Smith')).toBeInTheDocument();
  });

  it('includes AKC certification text', () => {
    render(<TrialSecretaryReport {...baseProps} />);
    expect(screen.getByText(/American Kennel Club/i)).toBeInTheDocument();
  });

  it('renders signature line', () => {
    render(<TrialSecretaryReport {...baseProps} />);
    expect(screen.getByText(/Signature/i)).toBeInTheDocument();
  });

  it('shows fee calculation', () => {
    render(<TrialSecretaryReport {...baseProps} />);
    expect(screen.getByText(/\$3\.50 per entry × 12 entries = \$42\.00 Total Service Charge/)).toBeInTheDocument();
  });
});
