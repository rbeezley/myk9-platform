import { describe, expect, it } from 'vitest';
import { UserRole } from '@/types/auth-types';
import {
  readRouteShowId,
  resolveComposeShow,
  selectComposeShows,
  type ComposeShowOption,
} from '../messageComposeShows';

describe('readRouteShowId', () => {
  it.each([
    ['/shows/s1', '', 's1'],
    ['/shows/s1/trials/t1/classes/c1', '', 's1'],
    ['/secretary/shows/s1/edit', '', 's1'],
    ['/secretary/messages/s1', '', 's1'],
    ['/secretary/entries/s1', '', 's1'],
    ['/at-show/s1/class/c1', '', 's1'],
    ['/messages/s1', '', 's1'],
    ['/secretary/messages', '?showId=s2', 's2'],
    ['/shows/s1', '?showId=s2', 's2'],
    ['/secretary/dashboard', '', ''],
    ['/shows/%E0%A4%A', '', '%E0%A4%A'],
  ])('%s%s -> %j', (pathname, search, expected) => {
    expect(readRouteShowId(pathname, search)).toBe(expected);
  });
});

describe('resolveComposeShow', () => {
  const a: ComposeShowOption = { id: 'a', name: 'A', lane: 'manage' };
  const b: ComposeShowOption = { id: 'b', name: 'B', lane: 'judge' };

  it('locks to the route show when the person may post there, over any pick', () => {
    expect(resolveComposeShow([a, b], 'b', 'a')).toEqual({ selected: b, locked: true });
  });

  it('never opens on a route show that is not offered', () => {
    expect(resolveComposeShow([a, b], 'elsewhere', '')).toEqual({
      selected: undefined,
      locked: false,
    });
    expect(resolveComposeShow([a], 'elsewhere', '')).toEqual({ selected: a, locked: false });
  });

  it('uses the pick only when it is still offered', () => {
    expect(resolveComposeShow([a, b], '', 'b')).toEqual({ selected: b, locked: false });
    expect(resolveComposeShow([a, b], '', 'gone')).toEqual({ selected: undefined, locked: false });
  });
});

describe('selectComposeShows fallback labels', () => {
  const judgeOnly = {
    shows: [],
    userWithRoles: null,
    hasRole: (_role: UserRole) => false,
  };

  it('never offers two identical destinations for store-missing judged shows', () => {
    const options = selectComposeShows({
      ...judgeOnly,
      judgedShows: [
        { showId: 'aaaaaa-111', firstTrialDate: '2027-03-06' },
        { showId: 'bbbbbb-222', firstTrialDate: '2027-03-06' },
        { showId: 'cccccc-333', firstTrialDate: null },
        { showId: 'dddddd-444', firstTrialDate: null },
      ],
    });

    const names = options.map(option => option.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual([
      'Show you are judging, Mar 6, 2027 (#aaaaaa)',
      'Show you are judging, Mar 6, 2027 (#bbbbbb)',
      'Show you are judging (#cccccc)',
      'Show you are judging (#dddddd)',
    ]);
  });

  it('leaves a label alone when nothing collides with it', () => {
    const options = selectComposeShows({
      ...judgeOnly,
      judgedShows: [
        { showId: 'aaaaaa-111', firstTrialDate: '2027-03-06' },
        { showId: 'bbbbbb-222', firstTrialDate: '2027-04-10' },
      ],
    });

    expect(options.map(option => option.name)).toEqual([
      'Show you are judging, Mar 6, 2027',
      'Show you are judging, Apr 10, 2027',
    ]);
  });
});
