/**
 * Regression: mapEntryStatus must handle 'in-ring' (myK9Q DB value) the same
 * as 'competing' (myK9Show legacy value). Before this fix, entries with
 * entry_status='in-ring' fell through to 'not_checked_in'.
 */

import { describe, it, expect } from 'vitest';
import { mapEntryStatus } from '@/hooks/useClassEntries';

const base = { is_scored: null, is_in_ring: null };

describe('mapEntryStatus', () => {
  it('maps competing to at_gate', () => {
    expect(mapEntryStatus({ ...base, entry_status: 'competing' })).toBe('at_gate');
  });

  it('maps in-ring to at_gate', () => {
    // myK9Q writes entry_status='in-ring'; must not fall through to not_checked_in
    expect(mapEntryStatus({ ...base, entry_status: 'in-ring' })).toBe('at_gate');
  });

  it('is_in_ring boolean takes priority over entry_status', () => {
    expect(mapEntryStatus({ is_scored: null, is_in_ring: true, entry_status: null })).toBe(
      'in_ring'
    );
  });

  it('maps scratched to pulled', () => {
    expect(mapEntryStatus({ ...base, entry_status: 'scratched' })).toBe('pulled');
  });

  it('maps confirmed to checked_in', () => {
    expect(mapEntryStatus({ ...base, entry_status: 'confirmed' })).toBe('checked_in');
  });
});
