import { render, screen } from '@/test/utils/testUtils';
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
      runOrder: 3,
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

  it('collapses missing row details into one honest schedule message', () => {
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
      screen.getAllByText('Schedule details will appear here when the show publishes them.')
    ).toHaveLength(1);
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
});
