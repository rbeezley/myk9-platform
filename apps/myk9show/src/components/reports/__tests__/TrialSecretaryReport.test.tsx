import { render, screen } from '@/test/utils/testUtils';
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
    armband: String(100 + i),
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
    expect(screen.getAllByText('12').length).toBeGreaterThan(0);
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
    expect(
      screen.getByText(/\$4\.50 per run × 12 paid runs = \$54\.00 Total Service Fees/)
    ).toBeInTheDocument();
  });

  it('uses the historical $3.50 rate through the end of 2025', () => {
    render(
      <TrialSecretaryReport {...baseProps} trial={{ ...baseProps.trial!, date: '2025-12-31' }} />
    );

    expect(
      screen.getByText(/\$3\.50 per run × 12 paid runs = \$42\.00 Total Service Fees/)
    ).toBeInTheDocument();
  });

  it('uses the same 2026 eligible-run calculation as the official PDF builder', () => {
    const entries = Array.from({ length: 136 }, (_, index) => ({
      ...baseProps.entries[0],
      id: `entry-${index}`,
      entryStatus: index === 134 ? 'withdrawn' : index === 135 ? 'scratched' : 'entered',
    }));

    render(<TrialSecretaryReport {...baseProps} entries={entries} />);

    expect(screen.getByText('136')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('134')).toBeInTheDocument();
    expect(
      screen.getByText(/\$4\.50 per run × 134 paid runs = \$603\.00 Total Service Fees/)
    ).toBeInTheDocument();
  });

  it.each([
    [undefined, 'Set a valid trial date before generating this report.'],
    ['not-a-date', 'Set a valid trial date before generating this report.'],
    [
      '2027-01-01',
      'This fee schedule covers 2025 and 2026 events only. Confirm the current AKC rate before generating this report.',
    ],
  ] as const)('blocks fee output for date %s and states recovery', (date, recovery) => {
    render(
      <TrialSecretaryReport
        {...baseProps}
        trial={date ? { ...baseProps.trial!, date } : undefined}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent(recovery);
    expect(screen.queryByText(/Total Service Fees/)).not.toBeInTheDocument();
  });

  it('matches the timing and address on canonical form JSW001 (11/25)', () => {
    render(<TrialSecretaryReport {...baseProps} />);

    expect(
      screen.getByText(/within seven \(7\) days after the close of the event/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/PO Box 900051, Raleigh, NC 27675-9051/)).toBeInTheDocument();
    expect(screen.queryByText(/within 15 days/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/8051 Arco Corporate Dr/i)).not.toBeInTheDocument();
  });

  it('leaves the compliance Yes/No boxes blank instead of pre-checking No', () => {
    // Regression: the "No" box was hardcoded as ☑ (checked) on a blank form the
    // secretary signs, asserting an answer not derived from data. Both compliance
    // questions must render unchecked (☐) so the human marks the real answer.
    render(<TrialSecretaryReport {...baseProps} />);
    expect(screen.queryByText(/☑/)).not.toBeInTheDocument();
    expect(screen.getAllByText('☐ No').length).toBeGreaterThanOrEqual(2);
  });
});
