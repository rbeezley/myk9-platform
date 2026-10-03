/**
 * MYK9-979 (Codex P2 round 2 on #2707): the edit panel writes
 * online_entries_enabled ONLY when the user changed the switch. A cached show
 * whose value is unknown stays unknown in the form, and no save turns it into
 * a guess.
 */
import { describe, it, expect } from 'vitest';
import { formDataToShowSaveData, showToFormData } from '../ShowEditPanel.helpers';
import type { Show } from '@/types/show-types';

const CACHED_WITHOUT_FIELD: Partial<Show> = {
  id: 'show-1',
  name: 'Fall Trial',
  organization: 'AKC',
  clubId: 'club-1',
  startDate: '2026-11-07',
  endDate: '2026-11-08',
  status: 'published',
};

describe('show edit panel — online entries switch is dirty-field only', () => {
  it('keeps an unknown value unknown in the form (never false)', () => {
    expect(showToFormData(CACHED_WITHOUT_FIELD)).not.toHaveProperty('onlineEntriesEnabled');
  });

  it('a name-only edit of a cached show without the field saves NO onlineEntriesEnabled', () => {
    const initial = showToFormData(CACHED_WITHOUT_FIELD);
    const saved = formDataToShowSaveData({ ...initial, name: 'Renamed' }, initial);
    expect(saved).not.toHaveProperty('onlineEntriesEnabled');
  });

  it('a name-only edit of a show whose value is known does not resend it', () => {
    const initial = showToFormData({ ...CACHED_WITHOUT_FIELD, onlineEntriesEnabled: true });
    const saved = formDataToShowSaveData({ ...initial, name: 'Renamed' }, initial);
    expect(saved).not.toHaveProperty('onlineEntriesEnabled');
  });

  it.each([
    [true, false],
    [false, true],
  ])('toggling the switch from %s saves %s', (from, to) => {
    const initial = showToFormData({ ...CACHED_WITHOUT_FIELD, onlineEntriesEnabled: from });
    const saved = formDataToShowSaveData({ ...initial, onlineEntriesEnabled: to }, initial);
    expect(saved).toHaveProperty('onlineEntriesEnabled', to);
  });
});
