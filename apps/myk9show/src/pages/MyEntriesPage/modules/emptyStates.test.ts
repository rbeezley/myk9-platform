import { describe, it, expect } from 'vitest';
import { EMPTY_STATE_BY_STATUS, EMPTY_STATE_BY_TAB, resolveEmptyState } from './emptyStates';

const TABS = ['all', 'upcoming', 'completed'] as const;
const STATUSES = ['pending', 'accepted', 'waitlist'] as const;

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

  // Phase A retired the status TABS; the reassurance they carried moved to the
  // status filter rather than being dropped.
  it('has an entry for every status filter', () => {
    for (const status of STATUSES) {
      const entry = EMPTY_STATE_BY_STATUS[status];
      expect(entry.heading.length).toBeGreaterThan(0);
      expect(entry.body.length).toBeGreaterThan(0);
      expect(entry.cta.label.length).toBeGreaterThan(0);
    }
  });

  it('reassures that the show secretary reviews entries when filtered to Pending', () => {
    expect(EMPTY_STATE_BY_STATUS.pending.body.toLowerCase()).toContain(
      'the show secretary is reviewing'
    );
  });

  it('explains what waitlisting means when filtered to Waitlist', () => {
    expect(EMPTY_STATE_BY_STATUS.waitlist.body.toLowerCase()).toContain('waitlisting happens');
  });

  describe('resolveEmptyState', () => {
    it('uses the tab copy when no status filter is applied', () => {
      expect(resolveEmptyState('completed', 'any')).toBe(EMPTY_STATE_BY_TAB.completed);
    });

    it('prefers the status copy, which explains WHY the list is empty', () => {
      expect(resolveEmptyState('upcoming', 'waitlist')).toBe(EMPTY_STATE_BY_STATUS.waitlist);
    });
  });

  it('points the Completed tab at Upcoming', () => {
    expect(EMPTY_STATE_BY_TAB.completed.cta.to).toBe('?tab=upcoming');
    expect(EMPTY_STATE_BY_TAB.completed.body.toLowerCase()).toContain('upcoming');
  });

  it('keeps "Browse All Shows" -> /shows as the default/all-tab recovery', () => {
    expect(EMPTY_STATE_BY_TAB.all.cta).toEqual({ label: 'Browse All Shows', to: '/shows' });
  });
});
