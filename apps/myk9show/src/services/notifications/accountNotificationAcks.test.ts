import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AlertEntry } from '@/store/notificationStore';
import { acknowledgeAccountNotifications } from './accountNotificationAcks';

const { mockFrom, mockUpdate, mockEq, mockIn } = vi.hoisted(() => {
  const mockIn = vi.fn().mockResolvedValue({ error: null });
  const mockEq = vi.fn(() => ({ in: mockIn }));
  const mockUpdate = vi.fn(() => ({ eq: mockEq }));
  const mockFrom = vi.fn(() => ({ update: mockUpdate }));
  return { mockFrom, mockUpdate, mockEq, mockIn };
});

vi.mock('@/lib/supabase', () => ({ supabase: { from: mockFrom } }));

function alert(id: string, userId?: string): AlertEntry {
  return {
    read: false,
    payload: {
      id,
      type: 'announcement',
      title: 'Account update',
      body: 'Approved',
      priority: 'normal',
      timestamp: 0,
      ...(userId ? { data: { accountNotificationUserId: userId } } : {}),
    },
  };
}

describe('acknowledgeAccountNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks only the current user account notice read', () => {
    acknowledgeAccountNotifications(
      [alert('own', 'user-1'), alert('other-user', 'user-2'), alert('show-alert')],
      'user-1'
    );

    expect(mockFrom).toHaveBeenCalledWith('notifications');
    expect(mockUpdate).toHaveBeenCalledWith({ read_at: expect.any(String) });
    expect(mockEq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(mockIn).toHaveBeenCalledWith('id', ['own']);
  });

  it('does not write without a signed-in user or matching account notice', () => {
    acknowledgeAccountNotifications([alert('own', 'user-1')], null);
    acknowledgeAccountNotifications([alert('other-user', 'user-2')], 'user-1');

    expect(mockFrom).not.toHaveBeenCalled();
  });
});
