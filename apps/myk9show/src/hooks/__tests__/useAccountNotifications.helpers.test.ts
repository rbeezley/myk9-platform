import { describe, it, expect } from 'vitest';
import { buildAccountNotificationPayload } from '../useAccountNotifications.helpers';

describe('buildAccountNotificationPayload', () => {
  it('maps a club_access_approved row to the exact bell/Message Center payload', () => {
    const payload = buildAccountNotificationPayload(
      {
        id: 'notif-1',
        type: 'club_access_approved',
        message:
          'Riverside Kennel Club is approved. You can now manage the club and create its shows.',
        deep_link_url: '/clubs/club-1',
        created_at: '2026-09-27T12:00:00.000Z',
      },
      'auth-user-1'
    );

    expect(payload).toEqual({
      id: 'notif-1',
      type: 'announcement',
      title: 'Account update',
      body: 'Riverside Kennel Club is approved. You can now manage the club and create its shows.',
      priority: 'normal',
      data: { accountNotificationUserId: 'auth-user-1' },
      actionUrl: '/clubs/club-1',
      timestamp: new Date('2026-09-27T12:00:00.000Z').getTime(),
    });
  });

  it('omits actionUrl rather than sending null when the row has no deep link', () => {
    const payload = buildAccountNotificationPayload(
      {
        id: 'notif-2',
        type: 'club_access_approved',
        message: 'msg',
        deep_link_url: null,
        created_at: '2026-09-27T12:00:00.000Z',
      },
      'auth-user-1'
    );

    expect(payload.actionUrl).toBeUndefined();
    expect('actionUrl' in payload).toBe(false);
  });

  it('titles an automatic wait list offer notice for the secretary (MYK9-1003)', () => {
    const payload = buildAccountNotificationPayload(
      {
        id: 'notif-3',
        type: 'waitlist_auto_offer',
        message: 'Rex was offered the open spot in Novice A automatically.',
        deep_link_url: '/shows/show-1/entries?tab=waitlist',
        created_at: '2026-10-04T12:00:00.000Z',
      },
      'auth-user-1'
    );

    expect(payload).toMatchObject({
      title: 'Wait list offer sent',
      body: 'Rex was offered the open spot in Novice A automatically.',
      actionUrl: '/shows/show-1/entries?tab=waitlist',
      data: { accountNotificationUserId: 'auth-user-1' },
    });
  });

  it('titles a mail-in head notice as a manual action (MYK9-1021)', () => {
    const payload = buildAccountNotificationPayload(
      {
        id: 'notif-mail-1',
        type: 'waitlist_mail_in_head',
        message:
          'A spot opened in Novice A. Rex is next and joined by mail; offer it from the Waitlist tab.',
        deep_link_url: '/shows/show-1/entries?tab=waitlist',
        created_at: '2026-10-07T01:00:00.000Z',
      },
      'auth-user-1'
    );

    expect(payload).toMatchObject({
      title: 'Mail-in dog needs an offer',
      actionUrl: '/shows/show-1/entries?tab=waitlist',
    });
  });
});
