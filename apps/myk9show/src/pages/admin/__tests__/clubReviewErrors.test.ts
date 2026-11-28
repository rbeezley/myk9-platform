import { describe, expect, it } from 'vitest';
import { clubReviewErrorMessage, loadFailureDescription } from '../clubReviewErrors';

describe('clubReviewErrorMessage', () => {
  it('turns a network failure into plain words', () => {
    const message = clubReviewErrorMessage(new TypeError('Failed to fetch'), 'decline this club');
    expect(message).toBe(
      'We could not reach myK9Show. Nothing was changed. Check your connection, then try to decline this club again.'
    );
  });

  it('recognises a PostgREST transport error, a plain object, without echoing its text', () => {
    const message = clubReviewErrorMessage(
      { message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' },
      'decline this club'
    );
    expect(message).toBe(
      'We could not reach myK9Show. Nothing was changed. Check your connection, then try to decline this club again.'
    );
    expect(message).not.toContain('TypeError');
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

  it('says in plain words when the request was already reviewed or its club removed (23514)', () => {
    expect(
      clubReviewErrorMessage({ code: '23514', message: 'raw check violation' }, 'decline this club')
    ).toBe(
      'This request was already reviewed, or its club was removed. Refresh the list to see where it stands.'
    );
  });

  it('tells the admin to decline when approving a request whose club was deleted (23514)', () => {
    expect(
      clubReviewErrorMessage(
        {
          code: '23514',
          message:
            "This request's club has been deleted, so it cannot be approved. Decline the request instead.",
        },
        'approve this club'
      )
    ).toBe(
      "This request's club was deleted, so it can't be approved. Decline the request instead."
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
