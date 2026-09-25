import { describe, expect, it } from 'vitest';
import {
  readRouteShowId,
  resolveComposeShow,
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
