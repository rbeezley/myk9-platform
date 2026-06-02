import { describe, expect, it, vi } from 'vitest';
import { createSendTargetedMessageHandler } from './targeted-message-handler';

type QueryResult = { data?: unknown; error?: unknown };

function chain(result: QueryResult) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    is: vi.fn(() => query),
    in: vi.fn(() => query),
    upsert: vi.fn(() => query),
    insert: vi.fn(() => query),
    delete: vi.fn(() => query),
    single: vi.fn(async () => result),
    then: (resolve: (value: QueryResult) => unknown) => Promise.resolve(result).then(resolve),
  };
  return query;
}

function makeSupabase() {
  const calls = {
    ringsideSessions: 0,
    accountPushSubscriptions: 0,
    insertedMessages: [] as Array<Record<string, unknown>>,
  };

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'shows') {
        return chain({ data: { id: 'show-1', club_id: 'club-1' } });
      }

      if (table === 'user_roles') {
        return chain({ data: [{ club_id: 'club-1', roles: { name: 'secretary' } }] });
      }

      if (table === 'classes') {
        return chain({ data: { id: 'class-1', class_number: 4, name: 'Novice' } });
      }

      if (table === 'entries') {
        return chain({
          data: [
            {
              armband: '101',
              dog: {
                owner: { auth_user_id: 'owner-1' },
                co_owner: { auth_user_id: null },
              },
              handler: { auth_user_id: 'sender-1' },
            },
          ],
        });
      }

      if (table === 'show_message_threads') {
        return chain({ data: [{ id: 'thread-1', participant_id: 'owner-1' }] });
      }

      if (table === 'show_messages') {
        const query = chain({ data: [{ id: 'message-1' }] });
        query.insert.mockImplementation((rows: Array<Record<string, unknown>>) => {
          calls.insertedMessages = rows;
          return query;
        });
        return query;
      }

      if (table === 'ringside_sessions') {
        calls.ringsideSessions += 1;
        return chain({
          data: [
            {
              subscription_id: 'sub-1',
              role: 'exhibitor',
              favorited_armbands: ['101'],
              last_seen_at: null,
              last_seen_route: '/at-show/show-1/class/class-1',
              push_subscriptions: {
                id: 'sub-1',
                endpoint: 'https://push.example/sub-1',
                p256dh: 'key',
                auth: 'auth',
              },
            },
          ],
        });
      }

      if (table === 'push_subscriptions') {
        calls.accountPushSubscriptions += 1;
        // The entered account exhibitor's own device — account-keyed (user_id),
        // resolved by entry rather than by a ringside session.
        return chain({
          data: [
            {
              id: 'acct-sub-1',
              endpoint: 'https://push.example/acct-sub-1',
              p256dh: 'key',
              auth: 'auth',
              user_id: 'owner-1',
            },
          ],
        });
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return { supabase, calls };
}

async function sendTargetedMessage(sendPush: boolean) {
  const { supabase, calls } = makeSupabase();
  const sendPasscodePushes = vi.fn(async ({ targets }) => ({
    attempted: targets.length,
    sent: targets.length,
    suppressed: 0,
    failed: 0,
    dead: 0,
  }));
  const handler = createSendTargetedMessageHandler({ sendPasscodePushes });

  const result = await handler({
    body: {
      show_id: 'show-1',
      class_id: 'class-1',
      target_type: 'class',
      body: 'Class 4 is delayed',
      send_push: sendPush,
    },
    user: { id: 'sender-1' },
    supabase,
  });

  return { result, sendPasscodePushes, calls };
}

// Mock that places the entered account exhibitor's OWN device on a live /at-show
// ringside session while leaving its favorites empty — so it never matches the
// class target and must inherit presence purely via the entry path.
function makePresenceSupabase() {
  return {
    from: vi.fn((table: string) => {
      if (table === 'shows') {
        return chain({ data: { id: 'show-1', club_id: 'club-1' } });
      }
      if (table === 'user_roles') {
        return chain({ data: [{ club_id: 'club-1', roles: { name: 'secretary' } }] });
      }
      if (table === 'classes') {
        return chain({ data: { id: 'class-1', class_number: 7, name: 'Open' } });
      }
      if (table === 'entries') {
        return chain({
          data: [
            {
              armband: '999',
              dog: {
                owner: { auth_user_id: 'owner-present' },
                co_owner: { auth_user_id: null },
              },
              handler: { auth_user_id: 'sender-1' },
            },
          ],
        });
      }
      if (table === 'show_message_threads') {
        return chain({ data: [{ id: 'thread-1', participant_id: 'owner-present' }] });
      }
      if (table === 'show_messages') {
        return chain({ data: [{ id: 'msg-1' }] });
      }
      if (table === 'ringside_sessions') {
        return chain({
          data: [
            {
              subscription_id: 'acct-present',
              role: 'exhibitor',
              favorited_armbands: [], // did NOT favorite armband 999
              last_seen_at: '2026-05-30T20:00:30.000Z',
              last_seen_route: '/at-show/show-1',
              push_subscriptions: {
                id: 'acct-present',
                endpoint: 'https://push.example/acct-present',
                p256dh: 'key',
                auth: 'auth',
                user_id: 'owner-present',
              },
            },
          ],
        });
      }
      if (table === 'push_subscriptions') {
        return chain({
          data: [
            {
              id: 'acct-present',
              endpoint: 'https://push.example/acct-present',
              p256dh: 'key',
              auth: 'auth',
              user_id: 'owner-present',
            },
          ],
        });
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

// Mock for a large all_show send: records the size of every user_id IN(...) filter
// hitting push_subscriptions so the chunking can be asserted.
function makeChunkSupabase(recipientCount: number) {
  const inUserIdChunkSizes: number[] = [];
  const entries = Array.from({ length: recipientCount }, (_, i) => ({
    armband: String(1000 + i),
    dog: { owner: { auth_user_id: `owner-${i}` }, co_owner: { auth_user_id: null } },
    handler: { auth_user_id: null },
  }));

  function recordingChain(result: QueryResult) {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      is: vi.fn(() => query),
      in: vi.fn((column: string, values: readonly unknown[]) => {
        if (column === 'user_id') inUserIdChunkSizes.push(values.length);
        return query;
      }),
      upsert: vi.fn(() => query),
      insert: vi.fn(() => query),
      single: vi.fn(async () => result),
      then: (resolve: (value: QueryResult) => unknown) => Promise.resolve(result).then(resolve),
    };
    return query;
  }

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'shows') return recordingChain({ data: { id: 'show-1', club_id: 'club-1' } });
      if (table === 'user_roles')
        return recordingChain({ data: [{ club_id: 'club-1', roles: { name: 'secretary' } }] });
      if (table === 'entries') return recordingChain({ data: entries });
      if (table === 'show_message_threads')
        return recordingChain({
          data: entries.map((_, i) => ({ id: `thread-${i}`, participant_id: `owner-${i}` })),
        });
      if (table === 'show_messages')
        return recordingChain({ data: entries.map((_, i) => ({ id: `msg-${i}` })) });
      if (table === 'ringside_sessions') return recordingChain({ data: [] });
      if (table === 'push_subscriptions') return recordingChain({ data: [] });
      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return { supabase, inUserIdChunkSizes };
}

describe('send-targeted-message handler push contract', () => {
  it('stores push_alert false and skips ringside fanout when send_push is false', async () => {
    const { result, sendPasscodePushes, calls } = await sendTargetedMessage(false);

    expect(calls.insertedMessages).toMatchObject([{ push_alert: false }]);
    expect(calls.ringsideSessions).toBe(0);
    expect(calls.accountPushSubscriptions).toBe(0);
    expect(sendPasscodePushes).toHaveBeenCalledWith(
      expect.objectContaining({
        targets: [],
      })
    );
    expect(result).toMatchObject({
      sent_to: 1,
      total_recipients: 1,
      push_sent: 0,
    });
  });

  it('fans out to ringside AND entered account exhibitors (by entry, no favorite) when send_push is true', async () => {
    const { result, sendPasscodePushes, calls } = await sendTargetedMessage(true);

    expect(calls.insertedMessages).toMatchObject([{ push_alert: true }]);
    expect(calls.ringsideSessions).toBe(1);
    // Account recipients' own devices are resolved by their entry's user_id.
    expect(calls.accountPushSubscriptions).toBe(1);

    const targets = sendPasscodePushes.mock.calls[0][0].targets;
    // Ringside passcode session...
    expect(targets).toContainEqual(
      expect.objectContaining({ subscription: expect.objectContaining({ id: 'sub-1' }) })
    );
    // ...PLUS the entered account exhibitor's device, account-keyed (user_id set)
    // so buildTargetedMessageActionUrl routes its tap to /messages.
    expect(targets).toContainEqual(
      expect.objectContaining({
        subscription: expect.objectContaining({ id: 'acct-sub-1', user_id: 'owner-1' }),
      })
    );

    expect(result).toMatchObject({
      sent_to: 1,
      total_recipients: 2,
      push_sent: 2,
    });
  });

  it('preserves live /at-show presence for an entered exhibitor who never favorited the dog', async () => {
    const supabase = makePresenceSupabase();
    const sendPasscodePushes = vi.fn(async ({ targets }) => ({
      attempted: targets.length,
      sent: targets.length,
      suppressed: 0,
      failed: 0,
      dead: 0,
    }));
    const handler = createSendTargetedMessageHandler({ sendPasscodePushes });

    await handler({
      body: {
        show_id: 'show-1',
        class_id: 'class-1',
        target_type: 'class',
        body: 'Class 7 is delayed',
        send_push: true,
      },
      user: { id: 'sender-1' },
      supabase,
    });

    const targets = sendPasscodePushes.mock.calls[0][0].targets;
    // Favorite-matching excludes this device from ringside targets (favorites are
    // empty), so it arrives purely via the account/entry path...
    expect(targets).toHaveLength(1);
    const target = targets[0];
    expect(target.subscription.id).toBe('acct-present');
    // ...but it MUST carry the device's real /at-show presence so the redundant
    // push is suppressed instead of buzzing someone watching the ring (P1 fix).
    expect(target.session.lastSeenAt).toBe('2026-05-30T20:00:30.000Z');
    expect(target.session.lastSeenRoute).toBe('/at-show/show-1');
  });

  it('chunks the account push subscription lookup at 100 user ids', async () => {
    const { supabase, inUserIdChunkSizes } = makeChunkSupabase(150);
    const sendPasscodePushes = vi.fn(async ({ targets }) => ({
      attempted: targets.length,
      sent: targets.length,
      suppressed: 0,
      failed: 0,
      dead: 0,
    }));
    const handler = createSendTargetedMessageHandler({ sendPasscodePushes });

    await handler({
      body: {
        show_id: 'show-1',
        target_type: 'all_show',
        body: 'Show-wide update',
        send_push: true,
      },
      user: { id: 'sender-1' },
      supabase,
    });

    // 150 recipients → 100 + 50, never one oversized IN(...) that overflows the URL.
    expect(inUserIdChunkSizes).toEqual([100, 50]);
  });
});
