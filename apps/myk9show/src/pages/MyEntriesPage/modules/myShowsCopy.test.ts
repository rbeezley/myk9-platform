import { describe, it, expect } from 'vitest';
import {
  CURRENT_ENTRIES_LABEL,
  CURRENT_ENTRIES_QUALIFIER,
  ALL_ENTRIES_LABEL,
  ALL_ENTRIES_SCOPE_NOTE,
  ENTRIES_LOAD_ERROR,
  PENDING_REVIEW_REASSURANCE,
} from './myShowsCopy';

describe('myShowsCopy pinned strings', () => {
  it('pins the current-entries scope label', () => {
    expect(CURRENT_ENTRIES_LABEL).toBe('Current entries');
  });

  it('pins the current-entries qualifier', () => {
    expect(CURRENT_ENTRIES_QUALIFIER).toBe('Upcoming + in review');
  });

  it('pins the all-entries label', () => {
    expect(ALL_ENTRIES_LABEL).toBe('All entries');
  });

  it('pins the all-entries scope note', () => {
    expect(ALL_ENTRIES_SCOPE_NOTE).toBe('Includes past shows');
  });

  it('pins the offline-first entries-load error copy', () => {
    expect(ENTRIES_LOAD_ERROR).toBe(
      "We couldn't refresh your entries just now. Your saved information is still here — try again in a moment."
    );
  });

  it('does not use blaming "check your connection" phrasing', () => {
    expect(ENTRIES_LOAD_ERROR.toLowerCase()).not.toContain('check your connection');
  });

  it('pins the pending-review reassurance line', () => {
    expect(PENDING_REVIEW_REASSURANCE).toBe('The show secretary is reviewing this entry.');
  });
});
