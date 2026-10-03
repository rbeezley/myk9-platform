import { describe, expect, it } from 'vitest';
import {
  ONLINE_ENTRIES_NOT_OPEN_ERROR,
  ONLINE_ENTRIES_OFF_ERROR,
  showOnlineEntryRefusal,
} from './showOnlineEntryGate';

describe('showOnlineEntryRefusal (MYK9-979)', () => {
  it('accepts a published show with online entries on', () => {
    expect(
      showOnlineEntryRefusal({ status: 'published', online_entries_enabled: true })
    ).toBeNull();
  });

  it('refuses a published show with online entries off', () => {
    expect(showOnlineEntryRefusal({ status: 'published', online_entries_enabled: false })).toBe(
      ONLINE_ENTRIES_OFF_ERROR
    );
  });

  it('fails closed when the column is missing from the row', () => {
    expect(showOnlineEntryRefusal({ status: 'published', online_entries_enabled: null })).toBe(
      ONLINE_ENTRIES_OFF_ERROR
    );
    expect(showOnlineEntryRefusal({ status: 'published', online_entries_enabled: undefined })).toBe(
      ONLINE_ENTRIES_OFF_ERROR
    );
  });

  it('keeps refusing a show that is not open for entries, whatever the switch says', () => {
    for (const status of ['draft', 'upcoming', 'in_progress', 'completed', 'cancelled', null]) {
      expect(showOnlineEntryRefusal({ status, online_entries_enabled: true })).toBe(
        ONLINE_ENTRIES_NOT_OPEN_ERROR
      );
    }
  });
});
