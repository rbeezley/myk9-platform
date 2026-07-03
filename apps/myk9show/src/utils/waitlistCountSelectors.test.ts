import { describe, expect, it } from 'vitest';
import {
  countQueuedWaitlistEntries,
  filterOfferedWaitlistEntries,
  filterQueuedWaitlistEntries,
} from './waitlistCountSelectors';

describe('waitlist count selectors', () => {
  it('uses queued waiting rows as the waitlist count source', () => {
    const rows = [
      { id: 'waiting-1', status: 'waiting' },
      { id: 'missing-status', status: null },
      { id: 'offered-1', status: 'offered' },
      { id: 'accepted-1', status: 'accepted' },
      { id: 'expired-1', status: 'expired' },
    ];

    expect(countQueuedWaitlistEntries(rows)).toBe(2);
    expect(filterQueuedWaitlistEntries(rows).map(row => row.id)).toEqual([
      'waiting-1',
      'missing-status',
    ]);
    expect(filterOfferedWaitlistEntries(rows).map(row => row.id)).toEqual(['offered-1']);
  });
});
