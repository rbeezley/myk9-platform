import { describe, expect, it } from 'vitest';
import {
  getShowDeskPeopleAtShowHref,
  SHOW_DESK_PEOPLE_AT_SHOW_TOOL_ID,
} from './peopleRosterRoutes';

describe('getShowDeskPeopleAtShowHref', () => {
  it('deep-links to the Show Desk with the People at show tool requested', () => {
    expect(getShowDeskPeopleAtShowHref({ showId: 'show-1' })).toBe(
      `/shows/show-1/show-day?tool=${SHOW_DESK_PEOPLE_AT_SHOW_TOOL_ID}`
    );
  });

  it('encodes a show id containing reserved characters', () => {
    expect(getShowDeskPeopleAtShowHref({ showId: 'show/1' })).toBe(
      `/shows/show%2F1/show-day?tool=${SHOW_DESK_PEOPLE_AT_SHOW_TOOL_ID}`
    );
  });
});
