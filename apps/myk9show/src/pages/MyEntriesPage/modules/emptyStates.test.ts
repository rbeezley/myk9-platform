import { describe, it, expect } from 'vitest';
import { EMPTY_STATE_BY_TAB } from './emptyStates';

const TABS = ['all', 'pending', 'accepted', 'waitlist', 'upcoming', 'completed'] as const;

describe('EMPTY_STATE_BY_TAB', () => {
  it('has an entry for every tab with heading, body, and cta', () => {
    for (const tab of TABS) {
      const entry = EMPTY_STATE_BY_TAB[tab];
      expect(entry).toBeDefined();
      expect(entry.heading.length).toBeGreaterThan(0);
      expect(entry.body.length).toBeGreaterThan(0);
      expect(entry.cta.label.length).toBeGreaterThan(0);
      expect(entry.cta.to.length).toBeGreaterThan(0);
    }
  });

  it('reassures that the show secretary reviews entries on the Pending tab', () => {
    expect(EMPTY_STATE_BY_TAB.pending.body.toLowerCase()).toContain(
      'the show secretary is reviewing'
    );
  });

  it('explains what waitlisting means on the Waitlist tab', () => {
    expect(EMPTY_STATE_BY_TAB.waitlist.body.toLowerCase()).toContain('waitlisting happens');
  });

  it('points the Completed tab at Upcoming', () => {
    expect(EMPTY_STATE_BY_TAB.completed.cta.to).toBe('?tab=upcoming');
    expect(EMPTY_STATE_BY_TAB.completed.body.toLowerCase()).toContain('upcoming');
  });

  it('keeps "Browse All Shows" -> /shows as the default/all-tab recovery', () => {
    expect(EMPTY_STATE_BY_TAB.all.cta).toEqual({ label: 'Browse All Shows', to: '/shows' });
  });
});
