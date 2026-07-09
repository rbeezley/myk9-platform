import { describe, it, expect } from 'vitest';
import {
  buildConfirmationStampPayload,
  isEligibleForScheduledConfirmationSend,
} from './entryConfirmationStamp';

describe('buildConfirmationStampPayload', () => {
  it('stamps sent_at/message_id/status=sent on a successful send (MP-13 scenario: online payment confirmation stamps entries)', () => {
    const patch = buildConfirmationStampPayload({
      sendSucceeded: true,
      messageId: 'msg_abc123',
      nowIso: '2026-07-09T12:00:00.000Z',
    });
    expect(patch).toEqual({
      confirmation_email_sent_at: '2026-07-09T12:00:00.000Z',
      confirmation_email_message_id: 'msg_abc123',
      confirmation_email_status: 'sent',
    });
  });

  it('stores a null message_id when the send path returned none, rather than dropping the stamp', () => {
    const patch = buildConfirmationStampPayload({
      sendSucceeded: true,
      messageId: null,
      nowIso: '2026-07-09T12:00:00.000Z',
    });
    expect(patch).toEqual({
      confirmation_email_sent_at: '2026-07-09T12:00:00.000Z',
      confirmation_email_message_id: null,
      confirmation_email_status: 'sent',
    });
  });

  it('returns null (no write) on a failed send, leaving the entry eligible for the scheduled sender (MP-13 scenario: failed webhook send leaves entry eligible)', () => {
    const patch = buildConfirmationStampPayload({
      sendSucceeded: false,
      messageId: null,
      nowIso: '2026-07-09T12:00:00.000Z',
    });
    expect(patch).toBeNull();
  });
});

describe('isEligibleForScheduledConfirmationSend (mirrors send-confirmation-email/index.ts audience WHERE clause)', () => {
  it('is eligible when never sent (sent_at null, status pending) — the fresh-entry case', () => {
    expect(
      isEligibleForScheduledConfirmationSend({
        confirmation_email_sent_at: null,
        confirmation_email_status: 'pending',
      })
    ).toBe(true);
  });

  it('is eligible when a prior send failed (status failed) — the retry case', () => {
    expect(
      isEligibleForScheduledConfirmationSend({
        confirmation_email_sent_at: null,
        confirmation_email_status: 'failed',
      })
    ).toBe(true);
  });

  it('is NOT eligible once stamped sent (status sent) — a stamped entry must not be reselected', () => {
    expect(
      isEligibleForScheduledConfirmationSend({
        confirmation_email_sent_at: '2026-07-09T12:00:00.000Z',
        confirmation_email_status: 'sent',
      })
    ).toBe(false);
  });

  it('is NOT eligible for a bounced entry — bounced is a terminal Resend-side outcome, not a webhook-retriable one', () => {
    expect(
      isEligibleForScheduledConfirmationSend({
        confirmation_email_sent_at: '2026-07-09T12:00:00.000Z',
        confirmation_email_status: 'bounced',
      })
    ).toBe(false);
  });

  it('exactly-one-email property: an entry stamped by the webhook path via buildConfirmationStampPayload is not eligible for the scheduled sender', () => {
    const patch = buildConfirmationStampPayload({
      sendSucceeded: true,
      messageId: 'msg_xyz',
      nowIso: '2026-07-09T12:00:00.000Z',
    });
    expect(patch).not.toBeNull();
    const entryAfterStamp = {
      confirmation_email_sent_at: patch!.confirmation_email_sent_at,
      confirmation_email_status: patch!.confirmation_email_status,
    };
    expect(isEligibleForScheduledConfirmationSend(entryAfterStamp)).toBe(false);
  });

  it('retry-does-not-duplicate property: an unstamped/failed entry (webhook send failed) remains eligible for the scheduled sender', () => {
    const patch = buildConfirmationStampPayload({
      sendSucceeded: false,
      messageId: null,
      nowIso: '2026-07-09T12:00:00.000Z',
    });
    expect(patch).toBeNull();
    // No stamp was applied — the entry's pre-existing pending/failed state is unchanged.
    const entryUnstamped = {
      confirmation_email_sent_at: null,
      confirmation_email_status: 'pending' as const,
    };
    expect(isEligibleForScheduledConfirmationSend(entryUnstamped)).toBe(true);
  });
});
