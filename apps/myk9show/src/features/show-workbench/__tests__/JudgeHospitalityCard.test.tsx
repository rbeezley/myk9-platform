import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { waitFor, within } from '@testing-library/react';
import { JudgeHospitalityCard } from '../JudgeHospitalityCard';
import { judgeHospitalityStorageKey } from '../judgeHospitality';

const judges = [
  { id: 'judge-1', name: 'Pat Judge' },
  { id: 'judge-2', name: 'Sam Judge' },
];

describe('JudgeHospitalityCard', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('tracks lunch and drink reminders per judge', async () => {
    const { user } = render(<JudgeHospitalityCard showId="show-1" judges={judges} />);

    expect(screen.getByRole('heading', { name: 'Hospitality' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Judges tracked' })).getByText('2')
    ).toBeInTheDocument();
    expect(screen.getByText('2 reminders')).toBeInTheDocument();

    await user.type(screen.getAllByLabelText('Lunch order')[0], 'Turkey sandwich');
    await user.click(screen.getByRole('checkbox', { name: 'Water delivered for Pat Judge' }));
    await user.click(screen.getByRole('checkbox', { name: 'Lunch delivered for Pat Judge' }));

    expect(
      within(screen.getByRole('group', { name: 'Lunch orders captured' })).getByText('1')
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Water reminders remaining' })).getByText('1 left')
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Judges handled' })).getByText('1/2')
    ).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'No water needed for Sam Judge' }));

    expect(
      within(screen.getByRole('group', { name: 'Water reminders remaining' })).getByText('0 left')
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Judges handled' })).getByText('2/2')
    ).toBeInTheDocument();
    expect(window.localStorage.getItem(judgeHospitalityStorageKey('show-1'))).toContain(
      'Turkey sandwich'
    );
  });

  it('renders an empty state before judges are assigned', () => {
    render(<JudgeHospitalityCard showId="show-1" judges={[]} />);

    expect(screen.getByText('No judges')).toBeInTheDocument();
    expect(
      screen.getByText('Add judges to the show before tracking lunch and drink reminders.')
    ).toBeInTheDocument();
  });

  it('reloads stored state when the active show changes', async () => {
    const { rerender, user } = render(<JudgeHospitalityCard showId="show-1" judges={judges} />);

    await user.type(screen.getAllByLabelText('Lunch order')[0], 'Turkey sandwich');

    expect(screen.getAllByLabelText('Lunch order')[0]).toHaveValue('Turkey sandwich');

    rerender(<JudgeHospitalityCard showId="show-2" judges={judges} />);

    await waitFor(() => {
      expect(screen.getAllByLabelText('Lunch order')[0]).toHaveValue('');
    });
  });
});
