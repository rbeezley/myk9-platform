import { describe, expect, it } from 'vitest';
import { getAuthoritativeEntryFeeCents, type RecoverableEntryRow } from './cartStore.recovery';

const entry: RecoverableEntryRow = {
  id: 'entry-1',
  class_id: 'class-1',
  dog_id: 'dog-1',
  handler_id: 'junior-1',
  entry_fee: 15,
  jump_height: null,
  special_requests: null,
  class_entry_fee: 30,
  show_pre_entry_fee: 30,
  show_day_of_show_fee: 35,
  show_start_date: '2026-01-01',
};

describe('recovered entry fee', () => {
  it('uses the fee recorded at submission after the show fee changes', () => {
    expect(getAuthoritativeEntryFeeCents(entry)).toBe(1500);
  });

  it('refuses a missing fee instead of inventing a new amount', () => {
    expect(() => getAuthoritativeEntryFeeCents({ ...entry, entry_fee: null })).toThrow(
      'no valid recorded fee'
    );
  });
});
