import { describe, expect, it } from 'vitest';
import { destinationEntryStatusFor, MOVE_UP_REQUEST_STATUSES } from '../moveUpRequestStatuses';

describe('destinationEntryStatusFor', () => {
  it.each(MOVE_UP_REQUEST_STATUSES)('fulfils the %s request instead of re-queuing it', status => {
    expect(destinationEntryStatusFor(status)).toBe('confirmed');
  });

  it.each(['submitted', 'pending-payment', 'promotion-expired', 'no-status', 'draft'])(
    'does NOT promote a %s source — a move-up is not an acceptance',
    status => {
      expect(destinationEntryStatusFor(status)).toBe(status);
    }
  );

  it('leaves an already-accepted source as it is', () => {
    expect(destinationEntryStatusFor('confirmed')).toBe('confirmed');
    expect(destinationEntryStatusFor('checked-in')).toBe('checked-in');
  });

  it('preserves null and blank', () => {
    expect(destinationEntryStatusFor(null)).toBeNull();
    expect(destinationEntryStatusFor(undefined)).toBeUndefined();
    expect(destinationEntryStatusFor('  ')).toBe('  ');
  });
});
