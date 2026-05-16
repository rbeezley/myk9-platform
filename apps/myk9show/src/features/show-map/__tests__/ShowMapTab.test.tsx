import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { render } from '@/test/utils/testUtils';
import ShowMapTab from '../ShowMapTab';
import type { Show } from '@/types/show-types';
import type { SyncableTrial } from '@/store/trial-store-types';

const show = { id: 'show-1', name: 'Spring Trial', clubName: 'Calm Canine Club' } as Show;
const trial = {
  id: 'trial-1',
  showId: 'show-1',
  showName: 'Spring Trial',
  trialDate: '2026-05-11',
  trialNumber: '1',
  status: 'In Progress',
  _version: 1,
  _lastModified: new Date(),
  _lastModifiedBy: 'test',
  _syncStatus: 'synced',
} as SyncableTrial;

describe('ShowMapTab', () => {
  it('renders counts, hierarchy, and capped entries', async () => {
    const entries = Array.from({ length: 27 }, (_, index) => ({
      id: `entry-${index}`,
      class_id: 'class-1',
      run_order: index,
      armband: String(index + 1),
      dog: { call_name: `Dog ${index}` },
    }));

    const { user } = render(
      <ShowMapTab
        show={show}
        trials={[trial]}
        classes={[
          {
            id: 'class-1',
            trialId: 'trial-1',
            name: 'Interior Novice A',
            status: 'In Progress',
          },
        ]}
        entries={entries}
        canManageShow
      />
    );

    expect(screen.getByText('Show Map')).toBeInTheDocument();
    expect(screen.getByText('Trials')).toBeInTheDocument();
    expect(screen.getByText('Classes')).toBeInTheDocument();
    expect(screen.getByText('Entries')).toBeInTheDocument();
    expect(screen.getByText('Need Attention')).toBeInTheDocument();
    expect(screen.getByText('Trial 1')).toBeInTheDocument();
    // Class rows are collapsed by default — the secretary opens the trial to drill in.
    expect(screen.queryByText('Interior Novice A')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /expand trial 1/i }));
    expect(screen.getByText('Interior Novice A')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /expand interior novice a/i }));

    expect(screen.getByText('2 more entries')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /score class/i })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /score entry/i })).not.toBeInTheDocument();
  });

  it('collapses class rows by default to avoid a wall of empty progress bars', () => {
    const trials = Array.from({ length: 4 }, (_, trialIndex) => ({
      ...trial,
      id: `trial-${trialIndex}`,
      trialNumber: String(trialIndex + 1),
    })) as SyncableTrial[];

    const classes = trials.flatMap(t =>
      Array.from({ length: 10 }, (_, classIndex) => ({
        id: `${t.id}-class-${classIndex}`,
        trialId: t.id,
        name: `Class ${trials.indexOf(t) * 10 + classIndex + 1}`,
        status: 'Not Started',
      }))
    );

    render(
      <ShowMapTab show={show} trials={trials} classes={classes} entries={[]} canManageShow />
    );

    // Trial rows render (root is expanded). Class rows do not (trials are collapsed).
    expect(screen.getByText('Trial 1')).toBeInTheDocument();
    expect(screen.getByText('Trial 4')).toBeInTheDocument();
    expect(screen.queryByText('Class 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Class 40')).not.toBeInTheDocument();
    // No class-level "Score Class" buttons should render either, since no
    // class rows are visible.
    expect(screen.queryByRole('button', { name: /score class/i })).not.toBeInTheDocument();
  });

  it('renders a calm empty state for shows without trials', () => {
    render(<ShowMapTab show={show} trials={[]} classes={[]} entries={[]} canManageShow />);

    expect(screen.getByText('No trials yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /new trial/i })).toBeInTheDocument();
  });

  it('does not expose map content when canManageShow is false', () => {
    render(
      <ShowMapTab show={show} trials={[trial]} classes={[]} entries={[]} canManageShow={false} />
    );

    expect(screen.queryByText('Show Map')).not.toBeInTheDocument();
    expect(screen.getByText(/show map is only available to show staff/i)).toBeInTheDocument();
  });
});
