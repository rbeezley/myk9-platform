// @vitest-environment node
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createProximityPushPort } from './proximityPush.ts';
import type { ProximityRecipient } from './runProximity.ts';

const recipient = (authUserId: string, dogsAhead = 2): ProximityRecipient => ({
  authUserId,
  entryId: `entry-${authUserId}`,
  dogsAhead,
});
const context = { dogName: 'Rex', className: 'Novice', armband: 101 };

function fakeSupabase(rows: unknown[], error: { message: string } | null = null) {
  const reads: string[][] = [];
  const client = {
    from: () => ({
      select: () => ({
        in: (_column: string, ids: string[]) => {
          reads.push(ids);
          return Promise.resolve(error ? { data: null, error } : { data: rows, error: null });
        },
      }),
      delete: () => ({ in: () => Promise.resolve({ error: null }) }),
    }),
  };
  return { client: client as unknown as SupabaseClient, reads };
}

const row = (userId: string, device: string) => ({
  user_id: userId,
  endpoint: `https://push.example/${userId}/${device}`,
  p256dh: 'k',
  auth: 'a',
});

afterEach(() => vi.restoreAllMocks());

describe('createProximityPushPort', () => {
  it('reads subscriptions once for all recipients and sends to every device', async () => {
    const { client, reads } = fakeSupabase([row('u1', 'a'), row('u1', 'b'), row('u2', 'a')]);
    const webpush = { sendNotification: vi.fn().mockResolvedValue({}) };
    const sendPush = createProximityPushPort({
      webpush,
      supabase: client,
      classId: 'class-1',
      pushUserIds: ['u1', 'u2'],
    });

    await sendPush(recipient('u1', 0), context);
    await sendPush(recipient('u2', 3), context);

    expect(reads).toEqual([['u1', 'u2']]);
    expect(webpush.sendNotification).toHaveBeenCalledTimes(3);
    const [, body] = webpush.sendNotification.mock.calls[0];
    expect(JSON.parse(body)).toMatchObject({
      type: 'your_turn',
      actionUrl: '/classes/class-1',
    });
    expect(JSON.parse(body).title).toContain("You're up!");
  });

  it('resolves without sending when the user has no subscription (counted as sent, as before)', async () => {
    const { client } = fakeSupabase([]);
    const webpush = { sendNotification: vi.fn() };
    const sendPush = createProximityPushPort({
      webpush,
      supabase: client,
      classId: 'class-1',
      pushUserIds: ['u1'],
    });

    await expect(sendPush(recipient('u1'), context)).resolves.toBeUndefined();
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it('throws when every device rejects the push, but not when one still accepts it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { client } = fakeSupabase([row('u1', 'a'), row('u1', 'b'), row('u2', 'a')]);
    const webpush = {
      sendNotification: vi.fn(async (s: { endpoint: string }) => {
        if (s.endpoint !== 'https://push.example/u1/b') throw new Error('push service down');
      }),
    };
    const sendPush = createProximityPushPort({
      webpush,
      supabase: client,
      classId: 'class-1',
      pushUserIds: ['u1', 'u2'],
    });

    await expect(sendPush(recipient('u1'), context)).resolves.toBeUndefined();
    await expect(sendPush(recipient('u2'), context)).rejects.toThrow('rejected on all 1');
  });

  it('turns a failed subscription read into a per-recipient failure instead of throwing early', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { client } = fakeSupabase([], { message: 'db down' });
    const webpush = { sendNotification: vi.fn() };

    const sendPush = createProximityPushPort({
      webpush,
      supabase: client,
      classId: 'class-1',
      pushUserIds: ['u1'],
    });

    await expect(sendPush(recipient('u1'), context)).rejects.toThrow('lookup failed');
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });
});
