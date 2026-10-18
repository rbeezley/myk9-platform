import { render, screen, within } from '@/test/utils/testUtils';
import { DogEntriesSection } from '../DogEntriesSection';
import type { DogEntriesGroup } from '@/hooks/useShowEntriesForUser';

const group: DogEntriesGroup = {
  dogId: 'dog-1',
  dogName: 'Maggie',
  entries: [
    {
      entryId: 'entry-1',
      classId: 'class-1',
      trialId: 'trial-1',
      dogId: 'dog-1',
      dogName: 'Maggie',
      armband: '42',
      queue: { kind: 'waiting-unknown' },
      element: 'Detective',
      level: 'Novice',
      section: '',
      classTitle: 'Detective Novice',
      trialDate: '2026-05-09',
      dayLabel: 'Saturday, May 9',
      trialName: 'Trial 1',
      startTime: '8:00 AM',
      judgeName: 'Richard Beezley',
      dogsAhead: 2,
      entryStatus: 'confirmed',
      paymentStatus: 'paid',
      hasResult: false,
    },
  ],
};

describe('DogEntriesSection', () => {
  it('shows armband once in the dedicated run detail column', () => {
    render(<DogEntriesSection group={group} showId="show-1" />);

    expect(screen.queryByText('Armband 42')).not.toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('does not repeat the page-level schedule message for each dog', () => {
    render(
      <DogEntriesSection
        group={{
          ...group,
          entries: [
            { ...group.entries[0], entryId: 'entry-1', armband: '', startTime: '', judgeName: '' },
            { ...group.entries[0], entryId: 'entry-2', armband: '', startTime: '', judgeName: '' },
          ],
        }}
        showId="show-1"
      />
    );

    expect(
      screen.queryByText('Schedule details will appear here when the show publishes them.')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Time pending')).not.toBeInTheDocument();
    expect(screen.queryByText('Armband pending')).not.toBeInTheDocument();
    expect(screen.queryByText('TBD')).not.toBeInTheDocument();
    expect(screen.queryByText('No #')).not.toBeInTheDocument();
  });

  it('labels past entries without results as awaiting results, not upcoming', () => {
    render(
      <DogEntriesSection
        group={{
          ...group,
          entries: [
            {
              ...group.entries[0],
              trialDate: '2020-05-09',
              dayLabel: 'Saturday, May 9',
              hasResult: false,
            },
          ],
        }}
        showId="show-1"
      />
    );

    expect(screen.getByText('Awaiting results')).toBeInTheDocument();
    expect(screen.queryByText('Upcoming')).not.toBeInTheDocument();
  });

  it('renders a released qualification and time in the entry row', () => {
    render(
      <DogEntriesSection
        group={{
          ...group,
          entries: [
            {
              ...group.entries[0],
              hasResult: true,
              result: { qualified: true, time: '0:38.50' },
            },
          ],
        }}
        showId="show-1"
      />
    );

    expect(screen.getByText('Qualified')).toBeInTheDocument();
    expect(screen.getByText('0:38.50')).toBeInTheDocument();
    expect(screen.queryByText('Awaiting results')).not.toBeInTheDocument();
  });

  it.each([
    { qualified: true, chip: 'Qualified' },
    { qualified: false, chip: 'Not qualified' },
  ])(
    'withholds the placement and labels a $chip result preliminary until release',
    ({ qualified, chip }) => {
      const renderWith = (isPreliminary: boolean) =>
        render(
          <DogEntriesSection
            group={{
              ...group,
              entries: [
                {
                  ...group.entries[0],
                  hasResult: true,
                  result: { qualified, time: '0:52.40', placement: 1, isPreliminary },
                },
              ],
            }}
            showId="show-1"
          />
        );

      const unreleased = renderWith(true);
      const badge = screen.getByTestId('entry-result-badge');
      expect(within(badge).getByText(chip)).toBeInTheDocument();
      expect(within(badge).getByText('preliminary')).toBeInTheDocument();
      expect(screen.queryByText(/1st/)).not.toBeInTheDocument();
      unreleased.unmount();

      renderWith(false);
      const released = screen.getByTestId('entry-result-badge');
      expect(within(released).getByText(chip)).toBeInTheDocument();
      expect(within(released).queryByText('preliminary')).not.toBeInTheDocument();
      if (qualified) expect(within(released).getByText(/1st/)).toBeInTheDocument();
    }
  );

  it('uses the canonical pending-review label for an entry awaiting review', () => {
    render(
      <DogEntriesSection
        group={{
          ...group,
          entries: [{ ...group.entries[0], entryStatus: 'submitted' }],
        }}
        showId="show-1"
      />
    );

    expect(screen.getByText('Pending review')).toBeInTheDocument();
    expect(screen.queryByText('Not accepted')).not.toBeInTheDocument();
  });
  it('names a secretary class change in plain words (MYK9-1232)', () => {
    render(
      <DogEntriesSection
        group={{ ...group, entries: [{ ...group.entries[0], movedUpFrom: 'Detective Novice' }] }}
        showId="show-1"
      />
    );

    expect(screen.getByText(/Class changed from Detective Novice/)).toBeInTheDocument();
    expect(screen.queryByText(/moved up/i)).not.toBeInTheDocument();
  });
});
