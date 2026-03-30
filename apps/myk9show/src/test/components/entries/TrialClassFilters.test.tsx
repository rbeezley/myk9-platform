import { render, screen } from '@/test/utils/testUtils';
import { TrialClassFilters } from '@/components/entries/management/TrialClassFilters';

const mockTrials = [
  { id: 'trial-1', name: null, date: '2026-04-15', trial_number: 1 },
  { id: 'trial-2', name: 'Specialty Trial', date: '2026-04-16', trial_number: 2 },
];

const mockClasses = [
  { id: 'class-1', name: 'Novice A' },
  { id: 'class-2', name: 'Open B' },
];

const defaultProps = {
  trials: mockTrials,
  classes: mockClasses,
  trialFilter: null,
  classFilter: null,
  onTrialChange: vi.fn(),
  onClassChange: vi.fn(),
};

describe('TrialClassFilters', () => {
  it('renders trial dropdown with "All Trials" option', () => {
    render(<TrialClassFilters {...defaultProps} />);

    const trialSelect = screen.getByLabelText('Trial filter');
    expect(trialSelect).toBeInTheDocument();

    const allOption = screen.getByRole('option', { name: 'All Trials' });
    expect(allOption).toBeInTheDocument();
  });

  it('disables class dropdown when no trial selected', () => {
    render(<TrialClassFilters {...defaultProps} trialFilter={null} />);

    const classSelect = screen.getByLabelText('Class filter');
    expect(classSelect).toBeDisabled();
  });

  it('enables class dropdown when trial is selected and classes provided', () => {
    render(<TrialClassFilters {...defaultProps} trialFilter="trial-1" />);

    const classSelect = screen.getByLabelText('Class filter');
    expect(classSelect).not.toBeDisabled();
  });

  it('calls onTrialChange with trial id when trial selected', async () => {
    const onTrialChange = vi.fn();
    const { user } = render(
      <TrialClassFilters {...defaultProps} onTrialChange={onTrialChange} />
    );

    const trialSelect = screen.getByLabelText('Trial filter');
    await user.selectOptions(trialSelect, 'trial-1');

    expect(onTrialChange).toHaveBeenCalledWith('trial-1');
  });

  it('calls onTrialChange(null) when "All Trials" selected', async () => {
    const onTrialChange = vi.fn();
    const { user } = render(
      <TrialClassFilters
        {...defaultProps}
        trialFilter="trial-1"
        onTrialChange={onTrialChange}
      />
    );

    const trialSelect = screen.getByLabelText('Trial filter');
    await user.selectOptions(trialSelect, '');

    expect(onTrialChange).toHaveBeenCalledWith(null);
  });

  it('shows "Loading trials..." when isLoadingTrials is true', () => {
    render(<TrialClassFilters {...defaultProps} trials={[]} isLoadingTrials />);

    const trialSelect = screen.getByLabelText('Trial filter');
    expect(trialSelect).toBeDisabled();
    expect(screen.getByRole('option', { name: 'Loading trials...' })).toBeInTheDocument();
  });

  it('shows "No trials" when trials array is empty and not loading', () => {
    render(<TrialClassFilters {...defaultProps} trials={[]} />);

    expect(screen.getByRole('option', { name: 'No trials' })).toBeInTheDocument();
  });

  it('formats trial options as "Trial N — Mon D, YYYY"', () => {
    render(<TrialClassFilters {...defaultProps} />);

    expect(screen.getByRole('option', { name: 'Trial 1 — Apr 15, 2026' })).toBeInTheDocument();
  });

  it('uses trial name when available', () => {
    render(<TrialClassFilters {...defaultProps} />);

    expect(screen.getByRole('option', { name: 'Specialty Trial — Apr 16, 2026' })).toBeInTheDocument();
  });

  it('shows "Loading classes..." when isLoadingClasses is true', () => {
    render(
      <TrialClassFilters
        {...defaultProps}
        trialFilter="trial-1"
        classes={[]}
        isLoadingClasses
      />
    );

    const classSelect = screen.getByLabelText('Class filter');
    expect(classSelect).toBeDisabled();
    expect(screen.getByRole('option', { name: 'Loading classes...' })).toBeInTheDocument();
  });
});
