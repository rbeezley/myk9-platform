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

describe('send-targeted-message handler push contract', () => {
  it('stores push_alert false and skips ringside fanout when send_push is false', async () => {
    const { result, sendPasscodePushes, calls } = await sendTargetedMessage(false);

    expect(calls.insertedMessages).toMatchObject([{ push_alert: false }]);
    expect(calls.ringsideSessions).toBe(0);
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

  it('stores push_alert true and includes matching ringside targets when send_push is true', async () => {
    const { result, sendPasscodePushes, calls } = await sendTargetedMessage(true);

    expect(calls.insertedMessages).toMatchObject([{ push_alert: true }]);
    expect(calls.ringsideSessions).toBe(1);
    expect(sendPasscodePushes).toHaveBeenCalledWith(
      expect.objectContaining({
        targets: [
          expect.objectContaining({
            subscription: expect.objectContaining({ id: 'sub-1' }),
          }),
        ],
      })
    );
    expect(result).toMatchObject({
      sent_to: 1,
      total_recipients: 2,
      push_sent: 1,
    });
  });
});
