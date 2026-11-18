import { describe, expect, it } from 'vitest';
import { pendingEntryCopy } from '../pendingEntryCopy';

const tz = 'America/Chicago';

describe('pendingEntryCopy', () => {
  it('names the opening date when the window has not opened, even with classes assigned', () => {
    const copy = pendingEntryCopy({
      hasEntryClassInventory: true,
      entryWindowNotOpen: true,
      entryOpenDate: '2027-01-05T00:00:00+00:00',
      timezone: tz,
    });
    expect(copy.kind).toBe('not-open');
    expect(copy.nav).toBe('Opens Jan 5');
    expect(copy.sentence).toBe('Entries open January 5.');
    expect(copy.headlineLead).toBe('Entries open');
    expect(copy.headlineAccent).toBe('Jan 5');
  });

  it('is neutral when the window has not opened and no date is known', () => {
    const copy = pendingEntryCopy({ entryWindowNotOpen: true, entryOpenDate: null, timezone: tz });
    expect(copy.kind).toBe('not-open');
    expect(copy.nav).toBe('Not open yet');
    expect(copy.sentence).toBe('Entries are not open yet.');
  });

  it('prefers the opening date over missing classes while the window is unopened', () => {
    const copy = pendingEntryCopy({
      hasEntryClassInventory: false,
      entryWindowNotOpen: true,
      entryOpenDate: '2027-01-05',
      timezone: tz,
    });
    expect(copy.kind).toBe('not-open');
  });

  it('uses missing-class copy only for a confirmed empty inventory', () => {
    const copy = pendingEntryCopy({
      hasEntryClassInventory: false,
      entryWindowNotOpen: false,
      timezone: tz,
    });
    expect(copy.kind).toBe('no-classes');
    expect(copy.nav).toBe('Classes pending');
  });

  it('does not claim missing classes when inventory is unknown', () => {
    const copy = pendingEntryCopy({
      hasEntryClassInventory: null,
      entryWindowNotOpen: false,
      timezone: tz,
    });
    expect(copy.kind).toBe('not-open');
  });
});
