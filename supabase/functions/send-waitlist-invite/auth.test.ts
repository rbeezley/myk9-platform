import { describe, expect, it } from 'vitest';

import {
  assertWaitlistInviteSecret,
  resolveWaitlistInviteDecision,
  WAITLIST_INVITE_SECRET_HEADER,
} from './auth';

function request(secret?: string): Request {
  return new Request('https://example.test', {
    method: 'POST',
    headers: secret ? { [WAITLIST_INVITE_SECRET_HEADER]: secret } : {},
  });
}

describe('send-waitlist-invite authorization', () => {
  it('rejects requests without the shared secret before side effects', () => {
    expect(() => assertWaitlistInviteSecret(request(), 'expected-secret')).toThrow('Forbidden');
  });

  it('allows requests with the valid shared secret', () => {
    expect(() =>
      assertWaitlistInviteSecret(request('expected-secret'), 'expected-secret')
    ).not.toThrow();
  });

  it('fails closed when the shared secret is not configured', () => {
    expect(() => assertWaitlistInviteSecret(request('expected-secret'), undefined)).toThrow(
      'Invite verification not configured'
    );
  });

  it('keeps repeated valid requests idempotent when an invite was already sent', () => {
    expect(
      resolveWaitlistInviteDecision({
        role: 'club_official',
        access_invite_sent_at: '2026-07-03T12:00:00.000Z',
      })
    ).toEqual({ ok: false, reason: 'already_sent' });
  });
});
