/**
 * Regression: mapStatusToDb must return values that satisfy the entry_status
 * DB CHECK constraint (canonical union in types/entry-lifecycle.ts).
 *
 * Historical bug: the function previously returned UI-enum strings like
 * 'accepted', 'pending', 'waitlisted', 'rejected', 'cancelled' — none of
 * which exist in the DB constraint, so every status update silently failed.
 */

import { describe, it, expect } from 'vitest';
import { mapStatusToDb } from '@/utils/entryManagementUtils';
import { EntryStatus } from '@/types/show-registration-types';

describe('mapStatusToDb', () => {
  it('maps ACCEPTED → confirmed', () => {
    expect(mapStatusToDb(EntryStatus.ACCEPTED)).toBe('confirmed');
  });

  it('maps PENDING → submitted', () => {
    expect(mapStatusToDb(EntryStatus.PENDING)).toBe('submitted');
  });

  it('maps WAITLIST → submitted (waitlist state lives in waitlist_entries table)', () => {
    expect(mapStatusToDb(EntryStatus.WAITLIST)).toBe('submitted');
  });

  it('maps REJECTED → not_accepted (migration 173 added this constraint value)', () => {
    expect(mapStatusToDb(EntryStatus.REJECTED)).toBe('not_accepted');
  });

  it('maps CANCELLED → withdrawn', () => {
    expect(mapStatusToDb(EntryStatus.CANCELLED)).toBe('withdrawn');
  });

  it('maps MISSING_INFO → submitted', () => {
    expect(mapStatusToDb(EntryStatus.MISSING_INFO)).toBe('submitted');
  });
});
