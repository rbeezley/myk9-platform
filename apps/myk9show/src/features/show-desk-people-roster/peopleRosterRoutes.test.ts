import { describe, expect, it } from 'vitest';
import {
  getShowDeskPeopleAtShowHref,
  normalizePeopleRosterView,
  SHOW_DESK_PEOPLE_AT_SHOW_TOOL_ID,
  writePeopleRosterView,
} from './peopleRosterRoutes';

describe('getShowDeskPeopleAtShowHref', () => {
  it('deep-links to the Show Desk with the People at show tool requested', () => {
    expect(getShowDeskPeopleAtShowHref({ showId: 'show-1' })).toBe(
      `/shows/show-1/show-day?tool=${SHOW_DESK_PEOPLE_AT_SHOW_TOOL_ID}`
    );
  });

  it('carries the needs-check-in filter under its own view param (MYK9-812) so the roster lands pre-filtered', () => {
    expect(getShowDeskPeopleAtShowHref({ showId: 'show-1', filter: 'needs-check-in' })).toBe(
      `/shows/show-1/show-day?tool=${SHOW_DESK_PEOPLE_AT_SHOW_TOOL_ID}&view=needs-check-in`
    );
  });

  it('encodes a show id containing reserved characters', () => {
    expect(getShowDeskPeopleAtShowHref({ showId: 'show/1' })).toBe(
      `/shows/show%2F1/show-day?tool=${SHOW_DESK_PEOPLE_AT_SHOW_TOOL_ID}`
    );
  });
});

describe('normalizePeopleRosterView', () => {
  it.each([
    ['all', 'all'],
    ['needs-check-in', 'needs-check-in'],
    ['online', 'online'],
  ] as const)('round-trips the %s view', (raw, expected) => {
    expect(normalizePeopleRosterView(new URLSearchParams(`view=${raw}`))).toBe(expected);
  });

  it('normalizes a missing view to all', () => {
    expect(normalizePeopleRosterView(new URLSearchParams(''))).toBe('all');
  });

  it('normalizes an unsupported or stale view to all rather than an unexplained empty roster', () => {
    expect(normalizePeopleRosterView(new URLSearchParams('view=stale-value'))).toBe('all');
  });
});

describe('writePeopleRosterView', () => {
  it('sets the view param for a non-default view', () => {
    expect(writePeopleRosterView(new URLSearchParams(''), 'needs-check-in').toString()).toBe(
      'view=needs-check-in'
    );
  });

  it('omits the param entirely for the default view, matching a fresh URL', () => {
    expect(writePeopleRosterView(new URLSearchParams('view=online'), 'all').toString()).toBe('');
  });

  it('leaves every other existing param untouched, e.g. the cockpit day/focus/tool state', () => {
    const previous = new URLSearchParams('tool=people-at-show&day=2026-07-20&focus=class%2F1');
    expect(writePeopleRosterView(previous, 'online').toString()).toBe(
      'tool=people-at-show&day=2026-07-20&focus=class%2F1&view=online'
    );
  });
});
