// @vitest-environment node
//
// These cover code that runs under Deno, never in a browser. The suite's
// global jsdom environment is not just unnecessary here, it is ACTIVELY
// MISLEADING: jsdom swaps in its own `ArrayBuffer`, so a buffer built in test
// code is a different realm's object from the one `crypto.subtle` accepts, and
// `digest` rejects it with "2nd argument is not instance of ArrayBuffer" — on
// CI's Node and not on every developer's.
import { describe, expect, it, vi } from 'vitest';
import { HttpError } from '../http/responses.ts';
import { deliverStoredPacket, type PacketShow, type StoredPacket } from './deliverStoredPacket.ts';
import { TrialPacketProviderError } from './email.ts';

/**
 * Behavioural tests for the step both packet paths share.
 *
 * These drive a stub client rather than grepping the source: the ordering that
 * matters here (verify the object exists, check for a previous send, THEN
 * email, THEN record) is only a real guarantee if it is observed, and the
 * previous source-text assertions could not survive the extraction that let
 * the automated generator reuse this code at all.
 */

const SHOW: PacketShow = {
  id: 'a0000000-0000-4000-8000-000000000001',
  name: 'Heartland Scent Work',
  club_id: 'c0000000-0000-4000-8000-000000000001',
  end_date: '2026-09-20',
};

const PACKET: StoredPacket = {
  snapshotId: 'b0000000-0000-4000-8000-000000000002',
  storagePath: 'a0000000-0000-4000-8000-000000000001/b0000000-0000-4000-8000-000000000002.pdf',
  generatedAt: '2026-09-18T02:00:00.000Z',
  sha256: 'a'.repeat(64),
  pageCount: 36,
  byteSize: 240_000,
  trialDate: '2026-09-19',
  generatedBy: 'd0000000-0000-4000-8000-000000000003',
  generatedSource: 'manual',
};

interface StubOptions {
  /** A `sent` row for the same (show, day) under a DIFFERENT snapshot id. */
  sameDaySentAttempt?: { recipient_count: number; page_count: number } | null;
  roleRows?: unknown[];
  clubMembers?: unknown[];
  objects?: { name: string }[] | null;
  sentAttempt?: { recipient_count: number; page_count: number } | null;
  signedUrl?: string | null;
}

function makeStub(options: StubOptions = {}) {
  const calls: string[] = [];
  const inserts: Record<string, unknown>[] = [];
  const signedUrlOptions: unknown[] = [];

  const {
    roleRows = [
      {
        user_id: 'p1',
        auth_user_id: 'u1',
        club_id: null,
        show_id: SHOW.id,
        roles: { name: 'secretary' },
        people: { email: 'Secretary@example.com' },
      },
    ],
    clubMembers = [],
    objects = [{ name: `${PACKET.snapshotId}.pdf` }],
    sentAttempt = null,
    sameDaySentAttempt = null,
    signedUrl = 'https://storage.example/signed?token=x',
  } = options;
  // The snapshot-id lookup comes first, the same-day lookup second.
  let snapshotLookups = 0;

  function thenable(result: unknown) {
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'is', 'or', 'in', 'order', 'limit']) {
      query[method] = () => query;
    }
    query.maybeSingle = () => Promise.resolve(result);
    query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject);
    return query;
  }

  const supabase = {
    from(table: string) {
      calls.push(`from:${table}`);
      if (table === 'user_roles') return thenable({ data: roleRows, error: null });
      if (table === 'club_members') return thenable({ data: clubMembers, error: null });
      if (table === 'trial_packet_snapshots') {
        snapshotLookups += 1;
        const query = thenable({
          data: snapshotLookups === 1 ? sentAttempt : sameDaySentAttempt,
          error: null,
        }) as Record<string, unknown>;
        query.insert = (row: Record<string, unknown>) => {
          calls.push('insert:trial_packet_snapshots');
          inserts.push(row);
          return Promise.resolve({ error: null });
        };
        return query;
      }
      throw new Error(`unexpected table ${table}`);
    },
    storage: {
      from() {
        return {
          list: () => {
            calls.push('storage:list');
            return Promise.resolve({ data: objects, error: null });
          },
          createSignedUrl: (_path: string, _seconds: number, opts?: unknown) => {
            calls.push('storage:sign');
            signedUrlOptions.push(opts);
            return Promise.resolve({
              data: signedUrl ? { signedUrl } : null,
              error: signedUrl ? null : new Error('nope'),
            });
          },
        };
      },
    },
  } as unknown as Parameters<typeof deliverStoredPacket>[0];

  return { supabase, calls, inserts, signedUrlOptions };
}

function makeDeps(sendEmail = vi.fn().mockResolvedValue('provider-msg-1')) {
  return {
    getEnv: () => 'resend-key',
    now: () => new Date('2026-09-18T02:00:00.000Z'),
    sendEmail,
  };
}
const deps = makeDeps();

async function expectHttpError(promise: Promise<unknown>, status: number) {
  await expect(promise).rejects.toBeInstanceOf(HttpError);
  await promise.catch(error => expect((error as HttpError).status).toBe(status));
}

describe('deliverStoredPacket', () => {
  it('verifies the object, checks for a previous send, emails, then records — in that order', async () => {
    const { supabase, calls, inserts } = makeStub();
    const sendEmail = vi.fn().mockImplementation(() => {
      calls.push('email:send');
      return Promise.resolve('provider-msg-1');
    });

    const result = await deliverStoredPacket(supabase, SHOW, PACKET, makeDeps(sendEmail));

    expect(result.snapshotId).toBe(PACKET.snapshotId);
    expect(result.recipientCount).toBe(1);
    expect(result.pageCount).toBe(36);

    const list = calls.indexOf('storage:list');
    const sign = calls.indexOf('storage:sign');
    const email = calls.indexOf('email:send');
    const audit = calls.indexOf('insert:trial_packet_snapshots');
    expect(list).toBeGreaterThan(-1);
    expect(sign).toBeGreaterThan(list);
    expect(email).toBeGreaterThan(sign);
    // The audit row is written AFTER the provider accepted it, so a row saying
    // 'sent' is evidence rather than an optimistic guess.
    expect(audit).toBeGreaterThan(email);

    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      delivery_status: 'sent',
      generated_by: PACKET.generatedBy,
      recipient_count: 1,
      show_id: SHOW.id,
      snapshot_id: PACKET.snapshotId,
      provider_message_id: 'provider-msg-1',
      // The day is recorded, not just embedded in the email: it is the
      // automated trigger's idempotency key (MYK9-228 phase 4).
      trial_date: PACKET.trialDate,
      generated_source: 'manual',
    });
  });

  it('names the download after the show and the trial day, not the snapshot UUID', async () => {
    const { supabase, signedUrlOptions } = makeStub();
    await deliverStoredPacket(supabase, SHOW, PACKET, deps);
    expect(signedUrlOptions[0]).toEqual({
      download: 'heartland-scent-work-2026-09-19-emergency-packet.pdf',
    });
  });

  it('returns the earlier attempt without emailing again', async () => {
    const { supabase, inserts } = makeStub({
      sentAttempt: { recipient_count: 4, page_count: 12 },
    });

    const result = await deliverStoredPacket(supabase, SHOW, PACKET, deps);

    // The snapshot is immutable, so a retry would be a duplicate email to a
    // secretary who already has the link — and a second audit row claiming a
    // send that did not happen.
    expect(result.recipientCount).toBe(4);
    expect(result.pageCount).toBe(12);
    expect(inserts).toHaveLength(0);
  });

  it('refuses to mail a link to a path holding nothing', async () => {
    // createSignedUrl succeeds for a missing object, so without this check the
    // recipient gets a working link to a 404.
    const { supabase } = makeStub({ objects: [] });
    await expectHttpError(deliverStoredPacket(supabase, SHOW, PACKET, deps), 404);
  });

  it('refuses to send when no current official has an email address', async () => {
    const { supabase } = makeStub({ roleRows: [] });
    await expectHttpError(deliverStoredPacket(supabase, SHOW, PACKET, deps), 422);
  });

  it('does not treat a lapsed club member as a recipient', async () => {
    // The role row survives the membership; only club_members says whether the
    // person is still staff.
    const { supabase } = makeStub({
      roleRows: [
        {
          user_id: 'p9',
          auth_user_id: 'u9',
          club_id: SHOW.club_id,
          show_id: null,
          roles: { name: 'club_admin' },
          people: { email: 'lapsed@example.com' },
        },
      ],
      clubMembers: [],
    });
    await expectHttpError(deliverStoredPacket(supabase, SHOW, PACKET, deps), 422);
  });

  it('records a failed attempt when the provider rejects the send', async () => {
    // A provider failure must leave a durable trace: the packet IS in Storage,
    // and a secretary who never got the mail needs the show team to see why.
    const { supabase, inserts } = makeStub();
    const sendEmail = vi.fn().mockRejectedValue(new TrialPacketProviderError(422));
    await expectHttpError(
      deliverStoredPacket(supabase, SHOW, PACKET, makeDeps(sendEmail)),
      502,
    );
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      delivery_status: 'failed',
      error_message: 'provider_http_422',
    });
  });

  it('fails loudly rather than silently when email is not configured', async () => {
    const { supabase, inserts } = makeStub();
    await expectHttpError(
      deliverStoredPacket(supabase, SHOW, PACKET, { ...makeDeps(), getEnv: () => undefined }),
      503,
    );
    expect(inserts).toHaveLength(0);
  });
});

describe('the manual escape hatch', () => {
  /**
   * The secretary re-prepares Saturday's packet BECAUSE three dogs scratched
   * since the 18:00 copy. Capturing late changes is the packet's whole point,
   * and the issue names the manual button as the escape hatch for exactly it.
   * A same-day send-once guard that also applies here finds the 18:00 row,
   * sends nothing, and reports "stored and emailed" with the stale page count.
   */
  it('always sends a manual packet, even when the day already has one', async () => {
    const { supabase, inserts } = makeStub({
      sameDaySentAttempt: { recipient_count: 4, page_count: 40 },
    });
    const sendEmail = vi.fn().mockResolvedValue('provider-msg-2');

    const result = await deliverStoredPacket(supabase, SHOW, PACKET, makeDeps(sendEmail));

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(result.alreadyDelivered).toBe(false);
    expect(result.pageCount).toBe(PACKET.pageCount);
    expect(inserts).toHaveLength(1);
  });

  it('still refuses a second AUTOMATED send for a day already delivered', async () => {
    const { supabase, inserts } = makeStub({
      sameDaySentAttempt: { recipient_count: 4, page_count: 40 },
    });
    const sendEmail = vi.fn();

    const result = await deliverStoredPacket(
      supabase,
      SHOW,
      { ...PACKET, generatedBy: null, generatedSource: 'automated' },
      makeDeps(sendEmail)
    );

    expect(sendEmail).not.toHaveBeenCalled();
    expect(result.alreadyDelivered).toBe(true);
    expect(inserts).toEqual([]);
  });

  it('refuses to send a packet too large to record', async () => {
    // The audit row's CHECK caps byte_size at 20MiB, so an oversized packet
    // used to mail fine and then fail its insert every time.
    const { supabase } = makeStub();
    const sendEmail = vi.fn();
    await expectHttpError(
      deliverStoredPacket(
        supabase,
        SHOW,
        { ...PACKET, byteSize: 20 * 1024 * 1024 + 1 },
        makeDeps(sendEmail)
      ),
      413
    );
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

