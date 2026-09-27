import { describe, it, expect } from 'vitest';
import { buildAccountNotificationPayload } from '../useAccountNotifications.helpers';

describe('buildAccountNotificationPayload', () => {
  it('maps a club_access_approved row to the exact bell/Message Center payload', () => {
    const payload = buildAccountNotificationPayload({
      id: 'notif-1',
      type: 'club_access_approved',
      message:
        'Riverside Kennel Club is approved. You can now manage the club and create its shows.',
      deep_link_url: '/clubs/club-1',
      created_at: '2026-09-27T12:00:00.000Z',
    });

    expect(payload).toEqual({
      id: 'notif-1',
      type: 'announcement',
      title: 'Account update',
      body: 'Riverside Kennel Club is approved. You can now manage the club and create its shows.',
      priority: 'normal',
      actionUrl: '/clubs/club-1',
      timestamp: new Date('2026-09-27T12:00:00.000Z').getTime(),
    });
  });

  it('omits actionUrl rather than sending null when the row has no deep link', () => {
    const payload = buildAccountNotificationPayload({
      id: 'notif-2',
      type: 'club_access_approved',
      message: 'msg',
      deep_link_url: null,
      created_at: '2026-09-27T12:00:00.000Z',
    });

    expect(payload.actionUrl).toBeUndefined();
    expect('actionUrl' in payload).toBe(false);
  });
});
