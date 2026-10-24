// @vitest-environment node
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';
import { describe, expect, it, vi } from 'vitest';

import { AUDIENCE_RESOLUTION_ERROR } from './fanoutErrors.ts';
import {
  loadPushSubscriptions,
  PUSH_SUBSCRIPTION_CHUNK_SIZE,
  sendWebPushBatch,
  type PushSubscriptionRow,
} from './pushFanout.ts';

const sub = (userId: string, device: string): PushSubscriptionRow => ({
  user_id: userId,
  endpoint: `https://push.example/${userId}/${device}`,
  p256dh: 'p256dh',
  auth: 'auth',
});

/** A push_subscriptions-only fake that records every read and delete. */
function fakeSupabase(options: { rows?: PushSubscriptionRow[]; failChunk?: number } = {}) {
  const rows = options.rows ?? [];
  const reads: string[][] = [];
  const deletes: string[][] = [];
  const client = {
    from(table: string) {
      expect(table).toBe('push_subscriptions');
      return {
        select(columns: string) {
          expect(columns).toBe('user_id, endpoint, p256dh, auth');
          return {
            in(column: string, ids: string[]) {
              expect(column).toBe('user_id');
              const index = reads.push(ids) - 1;
              if (index === options.failChunk) {
                return Promise.resolve({ data: null, error: { message: 'boom' } });
              }
              return Promise.resolve({
                data: rows.filter(row => ids.includes(row.user_id)),
                error: null,
              });
            },
          };
        },
        delete() {
          return {
            in(column: string, endpoints: string[]) {
              expect(column).toBe('endpoint');
              deletes.push(endpoints);
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, reads, deletes };
}

describe('loadPushSubscriptions', () => {
  it('chunks user ids into one .in() read per chunk and merges the rows', async () => {
    const ids = Array.from({ length: 5 }, (_, i) => `u${i}`);
    const { client, reads } = fakeSupabase({ rows: ids.map(id => sub(id, 'a')) });

    const rows = await loadPushSubscriptions(client, ids, { chunkSize: 2 });

    expect(reads).toEqual([['u0', 'u1'], ['u2', 'u3'], ['u4']]);
    expect(rows.map(row => row.user_id).sort()).toEqual(ids);
  });

  it('uses the shared chunk size by default', async () => {
    const ids = Array.from({ length: PUSH_SUBSCRIPTION_CHUNK_SIZE + 1 }, (_, i) => `u${i}`);
    const { client, reads } = fakeSupabase();

    await loadPushSubscriptions(client, ids);

    expect(reads.map(chunk => chunk.length)).toEqual([PUSH_SUBSCRIPTION_CHUNK_SIZE, 1]);
  });

  it('issues no read for an empty audience', async () => {
    const { client, reads } = fakeSupabase();
    expect(await loadPushSubscriptions(client, [])).toEqual([]);
    expect(reads).toEqual([]);
  });

  it('fails closed when any chunk errors', async () => {
    const { client } = fakeSupabase({ failChunk: 1 });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(loadPushSubscriptions(client, ['a', 'b', 'c'], { chunkSize: 1 })).rejects.toThrow(
      AUDIENCE_RESOLUTION_ERROR
    );
  });
});

describe('sendWebPushBatch', () => {
  it('sends to every device of a user with no dedupe', async () => {
    const { client } = fakeSupabase();
    const webpush = { sendNotification: vi.fn().mockResolvedValue({}) };
    const subs = [sub('u1', 'phone'), sub('u1', 'pwa'), sub('u2', 'phone')];
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await sendWebPushBatch(webpush, client, subs, '{"x":1}', { label: 't' });

    expect(webpush.sendNotification).toHaveBeenCalledTimes(3);
    expect(webpush.sendNotification).toHaveBeenCalledWith(
      { endpoint: 'https://push.example/u1/pwa', keys: { p256dh: 'p256dh', auth: 'auth' } },
      '{"x":1}'
    );
    expect(result).toEqual({ sent: 3, failed: 0, expired: 0, skipped: 0 });
  });

  it('deletes 404/410 endpoints in one query and keeps transient failures', async () => {
    const { client, deletes } = fakeSupabase();
    const errors: Record<string, number> = {
      'https://push.example/u1/gone': 410,
      'https://push.example/u2/missing': 404,
      'https://push.example/u3/flaky': 500,
    };
    const webpush = {
      sendNotification: vi.fn(async (s: { endpoint: string }) => {
        const statusCode = errors[s.endpoint];
        if (statusCode) throw Object.assign(new Error('rejected'), { statusCode });
      }),
    };
    const subs = [sub('u1', 'gone'), sub('u2', 'missing'), sub('u3', 'flaky'), sub('u4', 'ok')];
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await sendWebPushBatch(webpush, client, subs, 'p', { label: 't' });

    expect(deletes).toHaveLength(1);
    expect([...deletes[0]].sort()).toEqual([
      'https://push.example/u1/gone',
      'https://push.example/u2/missing',
    ]);
    expect(result).toEqual({ sent: 1, failed: 3, expired: 2, skipped: 0 });
  });

  it('does not issue a delete when nothing expired', async () => {
    const { client, deletes } = fakeSupabase();
    const webpush = { sendNotification: vi.fn().mockResolvedValue({}) };
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await sendWebPushBatch(webpush, client, [sub('u1', 'a')], 'p', { label: 't' });

    expect(deletes).toEqual([]);
  });

  it('resolves a per-recipient payload and skips users whose payload is null', async () => {
    const { client } = fakeSupabase();
    const webpush = { sendNotification: vi.fn().mockResolvedValue({}) };
    const subs = [sub('u1', 'a'), sub('u1', 'b'), sub('u2', 'a')];
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await sendWebPushBatch(
      webpush,
      client,
      subs,
      userId => (userId === 'u1' ? `payload-for-${userId}` : null),
      { label: 't' }
    );

    expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
    expect(webpush.sendNotification).toHaveBeenCalledWith(expect.anything(), 'payload-for-u1');
    expect(result).toEqual({ sent: 2, failed: 0, expired: 0, skipped: 1 });
  });

  it('logs one summary line, or none when quiet', async () => {
    const { client } = fakeSupabase();
    const webpush = { sendNotification: vi.fn().mockResolvedValue({}) };
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await sendWebPushBatch(webpush, client, [sub('u1', 'a'), sub('u2', 'a')], 'p', {
      label: 'push-x',
    });
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('push-x: sent=2/2 failed=0 expired=0 skipped=0');

    log.mockClear();
    await sendWebPushBatch(webpush, client, [sub('u1', 'a')], 'p', {
      label: 'push-x',
      quiet: true,
    });
    expect(log).not.toHaveBeenCalled();
  });
});
