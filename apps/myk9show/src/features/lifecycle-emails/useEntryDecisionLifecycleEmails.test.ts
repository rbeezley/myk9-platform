import { describe, expect, it } from 'vitest';
import { buildEntryDecisionLifecycleEmailIdempotencyKey } from './useEntryDecisionLifecycleEmails';

describe('buildEntryDecisionLifecycleEmailIdempotencyKey', () => {
  it('scopes decision emails by entry even when entries share one enrollment', () => {
    const firstEntryKey = buildEntryDecisionLifecycleEmailIdempotencyKey({
      showId: 'show-1',
      stepType: 'accepted',
      entryId: 'entry-1',
      enrollmentId: 'enrollment-1',
      correctionForJobId: null,
    });
    const secondEntryKey = buildEntryDecisionLifecycleEmailIdempotencyKey({
      showId: 'show-1',
      stepType: 'accepted',
      entryId: 'entry-2',
      enrollmentId: 'enrollment-1',
      correctionForJobId: null,
    });

    expect(firstEntryKey).toContain(':entry-1:');
    expect(secondEntryKey).toContain(':entry-2:');
    expect(firstEntryKey).not.toBe(secondEntryKey);
  });
});
