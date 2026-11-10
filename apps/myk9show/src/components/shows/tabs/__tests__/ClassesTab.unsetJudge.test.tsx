import { beforeEach, describe, expect, it } from 'vitest';
import { searchHaystack } from '@/components/ui/data-table/listSearch';
import { render, screen } from '@/test/utils/testUtils';
import { ClassesTab } from '../ClassesTab';
import { buildClassesTabColumns } from '../classesTabColumns';

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

  it('reads No judge yet for an empty name too', () => {
    render(
      <ClassesTab classes={[{ ...unjudged, judgeName: '' }]} showId="s1" userHasEntries={false} />
    );
    expect(screen.getByText('No judge yet')).toBeInTheDocument();
    expect(screen.queryByText('TBD')).not.toBeInTheDocument();
  });

  it('finds an unset class by the label or the old TBD, and a real judge by name', () => {
    const columns = buildClassesTabColumns({ hideRing: false });
    const haystack = (judgeName: string) =>
      searchHaystack({ ...unjudged, judgeName } as never, columns as never);
    for (const judgeName of ['TBD', '']) {
      expect(haystack(judgeName)).toContain('no judge');
      expect(haystack(judgeName)).toContain('tbd');
    }
    expect(haystack('Pat Lee')).toContain('pat lee');
    expect(haystack('Pat Lee')).not.toContain('no judge');
  });
});
