import { describe, expect, it, vi } from 'vitest';
import {
  buildWaitlistNotificationContent,
  parseWaitlistNotificationPayload,
  redactWaitlistDeliveryError,
  runWaitlistDeliveryChannels,
  shouldDeliverWaitlistEvent,
} from './waitlistNotification';

const payload = {
  event_id: '00000000-0000-4000-8000-000000000001',
  waitlist_entry_id: '00000000-0000-4000-8000-000000000002',
  event_type: 'offered',
} as const;

describe('parseWaitlistNotificationPayload', () => {
  it('accepts the durable event identity and supported event type', () => {
    expect(parseWaitlistNotificationPayload(payload)).toEqual(payload);
  });

  it.each([
    [{ ...payload, event_id: 'not-a-uuid' }],
    [{ ...payload, waitlist_entry_id: '' }],
    [{ ...payload, event_type: 'paid' }],
    [{}],
  ])('rejects an invalid dispatcher payload', candidate => {
    expect(() => parseWaitlistNotificationPayload(candidate)).toThrow('Invalid payload');
  });
});

describe('buildWaitlistNotificationContent', () => {
  it.each([
    ['offered', 'A spot is ready for you', 'Complete your entry'],
    ['reminder', 'Your waitlist spot is still waiting', 'Complete your entry'],
    ['expired', 'Your waitlist offer has ended', 'View your entries'],
  ] as const)(
    'builds calm %s email and push copy with the My Entries deep link',
    (eventType, title, actionLabel) => {
      const content = buildWaitlistNotificationContent({
        eventType,
        waitlistEntryId: payload.waitlist_entry_id,
        recipientName: 'Taylor',
        dogName: 'Scout',
        className: 'Novice Interior',
        showName: 'Summer Scent Trial',
        expiresAt: '2026-07-15T18:00:00.000Z',
        timezone: 'America/Denver',
        appOrigin: 'https://myk9show.com',
      });

      expect(content.title).toBe(title);
      expect(content.actionLabel).toBe(actionLabel);
      expect(content.actionUrl).toBe(
        `https://myk9show.com/exhibitor/entries?waitlistOffer=${payload.waitlist_entry_id}`
      );
      expect(content.emailHtml).toContain('Scout');
      expect(content.emailHtml).toContain('Novice Interior');
      expect(content.emailHtml).toContain(content.actionUrl);
      expect(content.emailHtml).not.toContain('checkout.stripe.com');
    }
  );
});

describe('shouldDeliverWaitlistEvent', () => {
  const activeOffer = {
    eventType: 'reminder' as const,
    eventOfferCycleAt: '2026-07-13T01:00:00.000Z',
    currentOfferCycleAt: '2026-07-13T01:00:00+00:00',
    waitlistStatus: 'offered',
    joinedVia: 'online',
    entryStatus: 'pending-payment',
    paymentStatus: 'pending',
    expiresAt: '2026-07-15T01:00:00.000Z',
    nowMs: Date.parse('2026-07-14T01:00:00.000Z'),
  };

  it('delivers only the current active unpaid offer cycle', () => {
    expect(shouldDeliverWaitlistEvent(activeOffer)).toBe(true);
    expect(
      shouldDeliverWaitlistEvent({ ...activeOffer, paymentStatus: 'paid' })
    ).toBe(false);
    expect(
      shouldDeliverWaitlistEvent({ ...activeOffer, waitlistStatus: 'expired' })
    ).toBe(false);
    expect(
      shouldDeliverWaitlistEvent({
        ...activeOffer,
        currentOfferCycleAt: '2026-07-16T01:00:00.000Z',
      })
    ).toBe(false);
  });

  it('delivers expiry only for the matching unpaid expired cycle', () => {
    expect(
      shouldDeliverWaitlistEvent({
        ...activeOffer,
        eventType: 'expired',
        waitlistStatus: 'expired',
        nowMs: Date.parse('2026-07-16T01:00:00.000Z'),
      })
    ).toBe(true);
  });
});

describe('runWaitlistDeliveryChannels', () => {
  it('still attempts push when email fails', async () => {
    const email = vi.fn().mockRejectedValue({ channel: 'email', statusCode: 503 });
    const push = vi.fn().mockResolvedValue(undefined);

    await expect(
      runWaitlistDeliveryChannels([
        { name: 'email', deliver: email },
        { name: 'push', deliver: push },
      ])
    ).resolves.toEqual(['email_http_503']);
    expect(email).toHaveBeenCalledOnce();
    expect(push).toHaveBeenCalledOnce();
  });
});

describe('redactWaitlistDeliveryError', () => {
  it('retains only a bounded failure category without provider details', () => {
    expect(
      redactWaitlistDeliveryError(
        new Error('Resend rejected secret@example.com using re_very-secret-provider-token')
      )
    ).toBe('delivery_error');
    expect(redactWaitlistDeliveryError({ channel: 'push', statusCode: 410 })).toBe('push_http_410');
  });
});
