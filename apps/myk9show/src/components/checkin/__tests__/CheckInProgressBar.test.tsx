import { render } from '@/test/utils/testUtils';
import { screen } from '@testing-library/react';
import { CheckInProgressBar } from '../CheckInProgressBar';

describe('CheckInProgressBar', () => {
  it('renders counts for each status group', () => {
    render(
      <CheckInProgressBar checkedInCount={27} partialCount={8} noneCount={12} totalEntries={47} />
    );
    expect(screen.getByText(/Checked In 27/)).toBeInTheDocument();
    expect(screen.getByText(/Partial 8/)).toBeInTheDocument();
    expect(screen.getByText(/Not Checked In 12/)).toBeInTheDocument();
  });

  it('shows percentage', () => {
    render(
      <CheckInProgressBar checkedInCount={27} partialCount={8} noneCount={12} totalEntries={47} />
    );
    expect(screen.getByText(/35 \/ 47/)).toBeInTheDocument();
    expect(screen.getByText(/74%/)).toBeInTheDocument();
  });

  it('handles zero entries gracefully', () => {
    render(
      <CheckInProgressBar checkedInCount={0} partialCount={0} noneCount={0} totalEntries={0} />
    );
    expect(screen.getByText(/0 \/ 0/)).toBeInTheDocument();
  });

  it('renders progress bar segments', () => {
    const { container } = render(
      <CheckInProgressBar checkedInCount={10} partialCount={5} noneCount={5} totalEntries={20} />
    );
    const segments = container.querySelectorAll('[data-testid="progress-segment"]');
    expect(segments).toHaveLength(3);
  });
});
