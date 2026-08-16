import { beforeEach, describe, expect, it, vi } from 'vitest';
import { syncNotificationPreferences } from './notificationPreferenceSync';

const upsertMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      upsert: (values: unknown, options: unknown) => upsertMock(table, values, options),
    }),
  },
}));

beforeEach(() => {
  upsertMock.mockReset().mockResolvedValue({ error: null });
});

describe('syncNotificationPreferences', () => {
  it('upserts the two server-read fields keyed on auth_user_id', async () => {
    const ok = await syncNotificationPreferences('user-1', { leadDogs: 4, pushEnabled: true });

    expect(ok).toBe(true);
    expect(upsertMock).toHaveBeenCalledWith(
      'notification_preferences',
      { auth_user_id: 'user-1', lead_dogs: 4, push_enabled: true },
      { onConflict: 'auth_user_id' }
    );
  });

  it('clamps lead dogs into the CHECK constraint range', async () => {
    await syncNotificationPreferences('user-1', { leadDogs: 99, pushEnabled: true });
    expect(upsertMock.mock.calls[0][1]).toMatchObject({ lead_dogs: 5 });

    upsertMock.mockClear();
    await syncNotificationPreferences('user-1', { leadDogs: 0, pushEnabled: true });
    expect(upsertMock.mock.calls[0][1]).toMatchObject({ lead_dogs: 1 });
  });

  it('does nothing when signed out', async () => {
    expect(await syncNotificationPreferences(null, { leadDogs: 3, pushEnabled: true })).toBe(false);
    expect(await syncNotificationPreferences(undefined, { leadDogs: 3, pushEnabled: true })).toBe(
      false
    );
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('reports failure without throwing so the settings UI is never blocked', async () => {
    upsertMock.mockResolvedValue({ error: { message: 'permission denied' } });
    expect(await syncNotificationPreferences('user-1', { leadDogs: 3, pushEnabled: true })).toBe(
      false
    );

    upsertMock.mockRejectedValue(new Error('offline'));
    await expect(
      syncNotificationPreferences('user-1', { leadDogs: 3, pushEnabled: true })
    ).resolves.toBe(false);
  });
});
