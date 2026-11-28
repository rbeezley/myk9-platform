import { describe, expect, it } from 'vitest';
import { clubReviewErrorMessage, loadFailureDescription } from '../clubReviewErrors';

describe('clubReviewErrorMessage', () => {
  it('turns a network failure into plain words', () => {
    const message = clubReviewErrorMessage(new TypeError('Failed to fetch'), 'decline this club');
    expect(message).toBe(
      'We could not reach myK9Show. Nothing was changed. Check your connection, then try to decline this club again.'
    );
  });

  it('names the step-up, has-shows and permission refusals by code, not message', () => {
    expect(clubReviewErrorMessage({ code: 'MKAUT', message: 'x' }, 'approve this club')).toBe(
      'Nothing was approved. Confirm your password to continue.'
    );
    expect(clubReviewErrorMessage({ code: 'MK011', message: 'x' }, 'decline this club')).toContain(
      'still has shows'
    );
    expect(clubReviewErrorMessage({ code: '42501', message: 'x' }, 'approve this club')).toBe(
      "You don't have permission to perform this action."
    );
  });

  it('falls back to a plain sentence that never echoes raw database text', () => {
    const message = clubReviewErrorMessage(
      { code: 'XX000', message: 'relation "clubs" violates something' },
      'approve this club'
    );
    expect(message).toBe("We couldn't approve this club. Nothing was changed. Try again.");
  });
});

describe('loadFailureDescription', () => {
  it('says what happened for the Users list instead of TypeError: Failed to fetch', () => {
    expect(loadFailureDescription(new TypeError('Failed to fetch'))).toBe(
      'We could not reach myK9Show. Check your connection and try again.'
    );
  });
});
