import { describe, expect, it } from 'vitest';
import { formatSyncFailureReason, type SyncFailedEventDetail } from '../replicationSyncFormatters';

/** `error` is the string the queue stores (mutation-retry.ts), prefix included. */
function stored(error: string): SyncFailedEventDetail {
  return {
    count: 1,
    message: '',
    mutations: [{ id: 'mut-1', tableName: 'entries', operation: 'UPDATE', error }],
  };
}

describe('formatSyncFailureReason with unreadable stored errors (MYK9-1146)', () => {
  it('shows the message the queue extracted from an error object', () => {
    expect(formatSyncFailureReason(stored('Non-retryable error: boom'))).toBe('Reason: boom');
  });

  it('never prints "[object Object]", including from rows stored before the fix', () => {
    for (const error of ['Non-retryable error: [object Object]', '[object Object]']) {
      const reason = formatSyncFailureReason(stored(error));
      expect(reason).not.toContain('[object Object]');
      expect(reason).toBe('Reason: no details were given.');
    }
  });
});

describe('formatSyncFailureReason for a ringside refusal (MYK9-1993)', () => {
  it('says "permission" in plain words instead of the server line with the class id', () => {
    const detail = stored('Non-retryable error: Not authorized to update class 6b1d-c1');
    detail.mutations[0]!.tableName = 'classes';
    expect(formatSyncFailureReason(detail)).toBe("You don't have permission to change this class.");
  });
});
