import { render, screen } from '@testing-library/react';
import { ResultLabelsReport } from '../ResultLabelsReport';
import type { DbClass, DbEntry, DbTrial } from '@/types/database-mappings';
import type { Show } from '@/types/show-types';

const show = {
  id: 'show-1',
  name: 'Spring Trial',
  clubName: 'Calm Canine Club',
} as Show;

const trials = [{ id: 'trial-1', trial_number: 1, date: '2026-05-11' }] as DbTrial[];
const classes = [
  { id: 'class-1', trial_id: 'trial-1', element: 'Buried', level: 'Novice', section: '' },
] as DbClass[];

describe('ResultLabelsReport', () => {
  it('shows the loading state and suppresses the empty state while data resolves', () => {
    // entries undefined + isLoading: the empty "No entries" copy must NOT flash.
    render(
      <ResultLabelsReport
        show={show}
        trials={trials}
        classes={classes}
        entries={undefined}
        trialId="all"
        classId="all"
        sortOrder="armband"
        isLoading={true}
      />
    );

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Loading entry data');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(screen.queryByText(/No entries to print labels/i)).not.toBeInTheDocument();
  });

  it('shows the empty state once loading completes with no entries', () => {
    render(
      <ResultLabelsReport
        show={show}
        trials={trials}
        classes={classes}
        entries={[] as DbEntry[]}
        trialId="all"
        classId="all"
        sortOrder="armband"
        isLoading={false}
      />
    );

    expect(screen.getByText(/No entries to print labels/i)).toBeInTheDocument();
    expect(screen.queryByText(/Loading entry data/i)).not.toBeInTheDocument();
  });
});
