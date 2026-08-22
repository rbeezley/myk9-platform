import { beforeEach, describe, expect, it, vi } from 'vitest';
import { syncNotificationPreferences } from './notificationPreferenceSync';

const rpcMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (functionName: string, args: unknown) => rpcMock(functionName, args),
  },
}));

beforeEach(() => {
  rpcMock.mockReset().mockResolvedValue({ data: true, error: null });
});

describe('syncNotificationPreferences', () => {
  it('upserts the two server-read fields keyed on auth_user_id', async () => {
    const ok = await syncNotificationPreferences('user-1', { leadDogs: 4, pushEnabled: true });

    expect(ok).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith('set_my_notification_preferences', {
      p_lead_dogs: 4,
      p_push_enabled: true,
    });
  });

  it('clamps lead dogs into the CHECK constraint range', async () => {
    await syncNotificationPreferences('user-1', { leadDogs: 99, pushEnabled: true });
    expect(rpcMock.mock.calls[0][1]).toMatchObject({ p_lead_dogs: 5 });

    rpcMock.mockClear();
    await syncNotificationPreferences('user-1', { leadDogs: 0, pushEnabled: true });
    expect(rpcMock.mock.calls[0][1]).toMatchObject({ p_lead_dogs: 1 });
  });

  it('does nothing when signed out', async () => {
    expect(await syncNotificationPreferences(null, { leadDogs: 3, pushEnabled: true })).toBe(false);
    expect(await syncNotificationPreferences(undefined, { leadDogs: 3, pushEnabled: true })).toBe(
      false
    );
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('reports failure without throwing so the settings UI is never blocked', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    expect(await syncNotificationPreferences('user-1', { leadDogs: 3, pushEnabled: true })).toBe(
      false
    );

    rpcMock.mockRejectedValue(new Error('offline'));
    await expect(
      syncNotificationPreferences('user-1', { leadDogs: 3, pushEnabled: true })
    ).resolves.toBe(false);
  });
});
