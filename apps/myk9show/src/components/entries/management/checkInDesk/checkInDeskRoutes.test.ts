import { describe, expect, it } from 'vitest';
import { getCheckInDeskHref, getRetiredPeopleAtShowRedirect } from './checkInDeskRoutes';

describe('getCheckInDeskHref', () => {
  it('opens the Check-in desk view', () => {
    expect(getCheckInDeskHref({ showId: 'show-1' })).toBe(
      '/shows/show-1/entries?tab=exceptions&exception=check-in'
    );
  });

  it('adds the not-checked-in filter', () => {
    expect(getCheckInDeskHref({ showId: 'show-1', notCheckedIn: true })).toBe(
      '/shows/show-1/entries?tab=exceptions&exception=check-in&checkin=pending'
    );
  });
});

describe('getRetiredPeopleAtShowRedirect', () => {
  it('sends ?tool=people-at-show to the desk', () => {
    expect(getRetiredPeopleAtShowRedirect('s1', new URLSearchParams('tool=people-at-show'))).toBe(
      '/shows/s1/entries?tab=exceptions&exception=check-in'
    );
  });

  it('keeps the needs-check-in view as the not-checked-in filter', () => {
    expect(
      getRetiredPeopleAtShowRedirect(
        's1',
        new URLSearchParams('tool=people-at-show&view=needs-check-in')
      )
    ).toBe('/shows/s1/entries?tab=exceptions&exception=check-in&checkin=pending');
  });

  it('ignores every other tool and URL', () => {
    expect(
      getRetiredPeopleAtShowRedirect('s1', new URLSearchParams('tool=self-checkin'))
    ).toBeNull();
    expect(getRetiredPeopleAtShowRedirect('s1', new URLSearchParams())).toBeNull();
  });
});
