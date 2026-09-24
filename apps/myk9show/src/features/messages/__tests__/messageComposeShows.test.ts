import { describe, expect, it } from 'vitest';
import { initialComposeShowId, readRouteShowId } from '../messageComposeShows';

describe('readRouteShowId', () => {
  it.each([
    ['/shows/s1', '', 's1'],
    ['/shows/s1/trials/t1/classes/c1', '', 's1'],
    ['/secretary/shows/s1/edit', '', 's1'],
    ['/secretary/messages/s1', '', 's1'],
    ['/secretary/entries/s1', '', 's1'],
    ['/at-show/s1/class/c1', '', 's1'],
    ['/secretary/messages', '?showId=s2', 's2'],
    ['/shows/s1', '?showId=s2', 's2'],
    ['/secretary/dashboard', '', ''],
    ['/shows/%E0%A4%A', '', '%E0%A4%A'],
  ])('%s%s -> %j', (pathname, search, expected) => {
    expect(readRouteShowId(pathname, search)).toBe(expected);
  });
});

describe('initialComposeShowId', () => {
  const options = [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B' },
  ];

  it('opens on the route show when it is offered', () => {
    expect(initialComposeShowId(options, 'b')).toBe('b');
  });

  it('never opens on a route show that is not offered', () => {
    expect(initialComposeShowId(options, 'elsewhere')).toBe('');
    expect(initialComposeShowId([options[0]], 'elsewhere')).toBe('a');
  });
});
