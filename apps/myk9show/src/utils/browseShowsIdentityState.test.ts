import { describe, expect, it } from 'vitest';
import { UserRole } from '@/types/auth-types';
import type { Show } from '@/types/show-types';
import { filterShowsForTab } from './unified-shows-config';

function makeShow(id: string): Show {
  return {
    id,
    name: id,
    organization: 'AKC',
    startDate: '2099-10-01',
    endDate: '2099-10-02',
    location: 'Test City',
    status: 'Upcoming',
    events: [],
    source: 'myK9Show',
    entryOpenDate: '2099-01-01',
    entryCloseDate: '2099-09-01',
    preEntryFee: '25',
    clubId: 'club-1',
    clubName: 'Test Club',
    clubAddress: '',
    clubEmail: '',
    assignedJudges: [],
    stats: [],
    trials: [],
    logoUrl: '',
    coverImageUrl: '',
    accentColor: '',
  };
}

describe('Browse Shows identity-pending filtering', () => {
  it.each([
    ['secretary', UserRole.SECRETARY, 'managing'],
    ['judge', UserRole.JUDGE, 'assignments'],
  ])('%s role does not fail open when person identity is pending', (_label, _role, tab) => {
    const shows = [makeShow('show-1')];

    expect(filterShowsForTab(tab, shows, [], null, 'pending')).toEqual([]);
  });

  it('keeps Browse All public content available while identity is pending', () => {
    const shows = [makeShow('show-1')];

    expect(filterShowsForTab('all', shows, [], null, 'pending')).toEqual(shows);
  });

  it('keeps confirmed missing identity distinct from anonymous guest semantics', () => {
    const shows = [makeShow('show-1')];

    expect(filterShowsForTab('managing', shows, [], null, 'missing')).toEqual([]);
    expect(filterShowsForTab('all', shows, [], null, 'missing')).toEqual(shows);
  });
});
