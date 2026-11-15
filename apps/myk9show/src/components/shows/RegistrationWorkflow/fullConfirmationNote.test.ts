import { describe, expect, it } from 'vitest';

import { fullConfirmationNote } from './fullConfirmationNote';

describe('fullConfirmationNote (MYK9-1999)', () => {
  it('tells the exhibitor what now happens, with no date and no draw', () => {
    const note = fullConfirmationNote('exhibitor');
    expect(note).toBe(
      'Once the show secretary accepts your entry, we will email you a full confirmation with your armband number, judge and directions.'
    );
    expect(note).not.toMatch(/draw|—/);
  });

  it('speaks about the exhibitor to staff who keyed the entry in', () => {
    for (const mode of ['secretary_new', 'club_admin', 'site_admin'] as const) {
      expect(fullConfirmationNote(mode)).toContain('the exhibitor gets a full confirmation');
    }
  });
});
