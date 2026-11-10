import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { ClassesTab } from '../ClassesTab';

const unjudged = {
  id: 'c1',
  name: 'Detective Novice',
  element: 'Detective',
  level: 'Novice',
  section: '',
  judgeName: 'TBD',
  trialId: 't1',
  time: '8:00 AM',
  ring: 1,
  status: 'Upcoming' as const,
  entryCount: 4,
  userHasEntry: false,
  trialDate: '2026-05-09',
  trialNumber: '1',
  trialName: 'Saturday Trial 1',
};

describe('ClassesTab unset judge (MYK9-1846)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('view-pref-classes', 'table');
  });

  it('reads No judge yet in the table cell, never TBD', () => {
    render(<ClassesTab classes={[unjudged]} showId="s1" userHasEntries={false} />);
    expect(screen.getByText('No judge yet')).toBeInTheDocument();
    expect(screen.queryByText('TBD')).not.toBeInTheDocument();
  });
});
