import { describe, expect, it } from 'vitest';
import { WAITING_REASON, unsentScoreReason } from './unsentScoreReason';

const failed = (error: string, failureKind: 'authorization' | 'permanent' | 'max-retries') => ({
  status: 'failed' as const,
  error,
  failureKind,
});

describe('unsentScoreReason', () => {
  it('says a waiting score will be sent on its own', () => {
    expect(unsentScoreReason({ status: 'pending', error: 'statement timeout' })).toBe(
      WAITING_REASON
    );
  });

  it.each([
    [
      'Non-retryable error: This class is cancelled. Scores and check-ins are closed.',
      'permanent',
      'This class was cancelled.',
    ],
    [
      'Non-retryable error: This class is judged by Lee Okafor',
      'authorization',
      'This class is now judged by Lee Okafor.',
    ],
    [
      'Non-retryable error: This class has been deleted, so it can no longer take entries.',
      'permanent',
      'This class was deleted.',
    ],
    [
      'Non-retryable error: A Qualified needs a time. Add the time, or change the result to NQ.',
      'permanent',
      'A Qualified needs a time.',
    ],
  ] as const)('reads %s as plain words', (error, kind, expected) => {
    expect(unsentScoreReason(failed(error, kind))).toBe(expected);
  });

  it('never shows the server text it does not recognise', () => {
    const raw = 'Non-retryable error: new row violates check constraint "entries_chk_42"';
    const why = unsentScoreReason(failed(raw, 'permanent'));
    expect(why).toBe('The server did not accept this score.');
    expect(why).not.toContain('entries_chk_42');
    expect(unsentScoreReason(failed('Max retries exceeded: XX000 boom', 'max-retries'))).toBe(
      'The server did not take it after several tries.'
    );
    expect(unsentScoreReason(failed('Non-retryable error: RLS said no', 'authorization'))).toBe(
      'This sign-in is not allowed to score this class.'
    );
  });
});
