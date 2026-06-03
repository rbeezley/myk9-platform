import { describe, it, expect } from 'vitest';
import { USER_ENTRIES_SELECT } from './search';

/**
 * The PostgREST fallback for getUserEntries must select every column the
 * MyEntries mapper (transformEntry) reads. A dropped column silently renders a
 * default on the fallback path — e.g. a missing check_in_status reads as
 * "Not Checked In" even after a persisted check-in (the regression this guards).
 */
describe('USER_ENTRIES_SELECT (getUserEntries PostgREST fallback shape)', () => {
  const requiredColumns = [
    'check_in_status',
    'entry_status',
    'payment_status',
    'entry_fee',
    'armband',
    'is_scored',
    'result_status',
    'search_time_seconds',
    'total_faults',
    'final_placement',
    'start_date',
    'end_date',
    'entry_close_date',
    'call_name',
    'confirmation_number',
    'class_number',
  ];

  it.each(requiredColumns)('selects "%s"', column => {
    expect(USER_ENTRIES_SELECT).toContain(column);
  });
});
