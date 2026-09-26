import { render, screen } from '@/test/utils/testUtils';
import { TrialsTab } from '../TrialsTab';
import type { Trial } from '@/components/trials/types/trial.types';

function makeTrial(n: number): Trial {
  return {
    id: `t${n}`,
    showId: 's1',
    showName: 'Test Show',
    trialDate: '2026-05-09',
    trialNumber: String(n),
    status: 'Upcoming',
    name: `Trial ${n}`,
    trialType: 'scent_work',
    plannedStartTime: '8:00 AM',
  };
}

// Above TRIALS_SEARCH_THRESHOLD (7), the search bar shows.
const eightTrials: Trial[] = Array.from({ length: 8 }, (_, i) => makeTrial(i + 1));
// One trial removed — below the threshold — while a search may still be active.
const sevenTrials: Trial[] = eightTrials.slice(0, 7);

const emptyStats = Object.fromEntries(
  eightTrials.map(trial => [trial.id, { classCount: 0, entryCount: 0, completedClasses: 0 }])
);

describe('TrialsTab search visibility and reset (Codex findings)', () => {
  it('keeps the search box visible when the trial count drops below the threshold while a search is active', async () => {
    const { user, rerender } = render(
      <TrialsTab trials={eightTrials} showId="s1" trialStats={emptyStats} />
    );

    const searchInput = screen.getByPlaceholderText('Search trials...');
    await user.type(searchInput, 'Trial 1');

    // The show drops to 7 trials — at/below the threshold — while the search
    // term is still applied.
    rerender(<TrialsTab trials={sevenTrials} showId="s1" trialStats={emptyStats} />);

    expect(screen.getByPlaceholderText('Search trials...')).toBeInTheDocument();
  });

  it('clears both the search term and the status filter from "Show all trials"', async () => {
    const { user } = render(<TrialsTab trials={eightTrials} showId="s1" trialStats={emptyStats} />);

    const searchInput = screen.getByPlaceholderText('Search trials...');
    await user.type(searchInput, 'no match at all');

    const showAllButton = await screen.findByRole('button', { name: /show all trials/i });
    await user.click(showAllButton);

    expect(screen.getByPlaceholderText('Search trials...')).toHaveValue('');
    expect(screen.getByText('Trial 1')).toBeInTheDocument();
  });
});
