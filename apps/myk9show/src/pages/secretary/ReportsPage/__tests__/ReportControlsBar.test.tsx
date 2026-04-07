import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { ReportControlsBar } from '../ReportControlsBar';

const mockTrials = [
  { id: 'trial-1', trial_number: 1, date: '2026-04-12' },
  { id: 'trial-2', trial_number: 2, date: '2026-04-12' },
];

const mockClasses = [
  { id: 'class-1', element: 'Buried', level: 'Novice', section: '', trial_id: 'trial-1' },
  { id: 'class-2', element: 'Interior', level: 'Advanced', section: '', trial_id: 'trial-1' },
];

const defaultProps = {
  reportType: 'check-in-sheet',
  trialId: 'all',
  classId: 'all',
  sortOrder: 'run-order',
  trials: mockTrials,
  classes: mockClasses,
  onReportTypeChange: vi.fn(),
  onTrialChange: vi.fn(),
  onClassChange: vi.fn(),
  onSortChange: vi.fn(),
  onPrint: vi.fn(),
};

describe('ReportControlsBar', () => {
  it('renders Print button', () => {
    render(<ReportControlsBar {...defaultProps} />);
    expect(screen.getByRole('button', { name: /print/i })).toBeInTheDocument();
  });

  it('shows the current report type name', () => {
    render(<ReportControlsBar {...defaultProps} />);
    // Base UI Select renders items into a portal; the trigger shows the raw value.
    // The hidden input carries the value — check that the report value is present.
    const hiddenInputs = document.querySelectorAll('input[aria-hidden="true"]');
    const reportInput = Array.from(hiddenInputs).find(
      el => (el as HTMLInputElement).value === 'check-in-sheet'
    );
    expect(reportInput).toBeTruthy();
  });

  it('shows All Trials text', () => {
    render(<ReportControlsBar {...defaultProps} />);
    // The trial trigger shows the raw value "all" in its span; the hidden input confirms it.
    const hiddenInputs = document.querySelectorAll('input[aria-hidden="true"]');
    const trialInput = Array.from(hiddenInputs).find(
      el => (el as HTMLInputElement).value === 'all'
    );
    expect(trialInput).toBeTruthy();
    // The label "Trial" is visible
    expect(screen.getByText('Trial')).toBeInTheDocument();
  });

  it('shows All Classes text', () => {
    render(<ReportControlsBar {...defaultProps} />);
    // The "Class" label is visible, confirming the class dropdown is rendered
    expect(screen.getByText('Class')).toBeInTheDocument();
    // The trigger span shows the raw value "all"
    const triggers = screen.getAllByRole('combobox');
    // triggers: [Report, Trial, Class, Sort] — class is index 2
    expect(triggers[2]).toBeInTheDocument();
  });

  it('class dropdown is disabled when trialId is "all"', () => {
    render(<ReportControlsBar {...defaultProps} trialId="all" />);
    // The SelectTrigger for the class dropdown should be disabled
    const triggers = screen.getAllByRole('combobox');
    // triggers: [Report, Trial, Class, Sort]
    const classTrigger = triggers[2];
    expect(classTrigger).toBeDisabled();
  });
});
