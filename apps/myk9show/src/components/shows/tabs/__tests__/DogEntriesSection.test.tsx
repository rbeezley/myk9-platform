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
});
