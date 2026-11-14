import { describe, it, expect } from 'vitest';
import {
  buildReceiptStampPayload,
  isEligibleForScheduledConfirmationSend,
} from './entryReceiptStamp';

describe('buildReceiptStampPayload', () => {
  it('stamps sent_at/message_id/status=sent on a successful send (MP-13 scenario: online payment confirmation stamps entries)', () => {
    const patch = buildReceiptStampPayload({
      sendSucceeded: true,
      messageId: 'msg_abc123',
      nowIso: '2026-07-09T12:00:00.000Z',
    });
    expect(patch).toEqual({
      receipt_email_sent_at: '2026-07-09T12:00:00.000Z',
      receipt_email_message_id: 'msg_abc123',
      receipt_email_status: 'sent',
      receipt_email_attempted_at: '2026-07-09T12:00:00.000Z',
    });
  });

  it('stores a null message_id when the send path returned none, rather than dropping the stamp', () => {
    const patch = buildReceiptStampPayload({
      sendSucceeded: true,
      messageId: null,
      nowIso: '2026-07-09T12:00:00.000Z',
    });
    expect(patch).toEqual({
      receipt_email_sent_at: '2026-07-09T12:00:00.000Z',
      receipt_email_message_id: null,
      receipt_email_status: 'sent',
      receipt_email_attempted_at: '2026-07-09T12:00:00.000Z',
    });
  });

  it('returns null (no write) on a failed send, writing nothing (the card receipt retries through the webhook replay)', () => {
    const patch = buildReceiptStampPayload({
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

  it('a receipt stamp leaves the entry eligible for the pre-show confirmation: a card payer still gets it', () => {
    const patch = buildReceiptStampPayload({
      sendSucceeded: true,
      messageId: 'msg_xyz',
      nowIso: '2026-07-09T12:00:00.000Z',
    });
    expect(patch).not.toBeNull();
    // The patch names no confirmation_email_* column, so the pre-show state is unchanged.
    expect(Object.keys(patch!).filter(k => k.startsWith('confirmation_email'))).toEqual([]);
    const entryAfterStamp = {
      confirmation_email_sent_at: null,
      confirmation_email_status: 'pending',
    };
    expect(isEligibleForScheduledConfirmationSend(entryAfterStamp)).toBe(true);
  });

  it('the pre-show confirmation still sends once: after it stamps sent, the entry is no longer eligible', () => {
    expect(
      isEligibleForScheduledConfirmationSend({
        confirmation_email_sent_at: '2026-07-09T12:00:00.000Z',
        confirmation_email_status: 'sent',
      })
    ).toBe(false);
  });
});
