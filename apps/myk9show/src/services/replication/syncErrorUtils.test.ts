import { describe, expect, it } from 'vitest';
import { getSyncErrorMessage, isAbortSyncError } from './syncErrorUtils';

describe('sync error messages', () => {
  it('hides PostgREST and statement-timeout details from the user', () => {
    const message = getSyncErrorMessage(
      new Error('Supabase query failed: canceling statement due to statement timeout')
    );

    expect(message).toBe(
      "We couldn't refresh saved show data. You can keep using the saved copy while we try again."
    );
    expect(message).not.toMatch(/supabase|statement timeout|canceling statement/i);
  });

  it('keeps abort detection based on the original error details', () => {
    const error = new Error('AbortError: signal is aborted without reason');

    expect(isAbortSyncError(error)).toBe(true);
    expect(getSyncErrorMessage(error)).toBe('Sync was cancelled.');
  });

  it('uses a safe fallback for non-Error database failures', () => {
    expect(getSyncErrorMessage({ message: 'PostgREST request timed out' })).toBe(
      "We couldn't refresh saved show data. You can keep using the saved copy while we try again."
    );
  });
});
