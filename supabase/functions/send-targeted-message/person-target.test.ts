// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createSendTargetedMessageHandler } from './targeted-message-handler';

type SettledResult = { data: unknown; error: unknown };

function chain(result: { data?: unknown; error?: unknown }) {
  const settled: SettledResult = { data: result.data ?? null, error: result.error ?? null };
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    is: vi.fn(() => query),
    or: vi.fn((_filter: string) => query),
    in: vi.fn(() => query),
    // The entries reader pages by id; any continuation page is past the fixture.
    gt: vi.fn(() => chain({ data: [] })),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    upsert: vi.fn((_rows: unknown, _options?: unknown) => query),
    insert: vi.fn((_rows: unknown) => query),
    single: vi.fn(async () => settled),
    then: <TResult1 = SettledResult, TResult2 = never>(
      resolve?: ((value: SettledResult) => TResult1 | PromiseLike<TResult1>) | null,
      reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ): Promise<TResult1 | TResult2> => Promise.resolve(settled).then(resolve, reject),
  };
  return query;
}

const person = (id: string, first: string, email: string | null, authUserId: string | null) => ({
  id,
  auth_user_id: authUserId,
  first_name: first,
  last_name: 'Smith',
  email,
});

// Ann owns the dog, Bob handles it; Cy owns a second dog. Ann is also a co-owner of Cy's dog.
const ENTRIES = [
  {
    id: 'e-101',
    armband: '101',
    dog: { owner: person('p-ann', 'Ann', 'ann@example.com', 'u-ann'), co_owner: null },
    handler: person('p-bob', 'Bob', null, 'u-bob'),
  },
  {
    id: 'e-102',
    armband: '102',
    dog: {
      owner: person('p-cy', 'Cy', 'cy@example.com', 'u-cy'),
      co_owner: person('p-ann', 'Ann', 'ann@example.com', 'u-ann'),
    },
    handler: person('p-cy', 'Cy', 'cy@example.com', 'u-cy'),
  },
];

function makeSupabase() {
  const threadUpserts: unknown[][] = [];
  const messageInserts: unknown[][] = [];
  const entryFilters: string[] = [];
  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'shows') {
        return chain({ data: { id: 'show-1', club_id: 'c', name: 'Fall Trial' } });
      }
      if (table === 'user_roles') {
        return chain({ data: [{ club_id: 'c', roles: { name: 'secretary' } }] });
      }
      if (table === 'dogs') return chain({ data: [{ id: 'dog-1' }, { id: 'dog-2' }] });
      if (table === 'entries') {
        const query = chain({ data: ENTRIES });
        query.or.mockImplementation((filter: string) => {
          entryFilters.push(filter);
          return query;
        });
        return query;
      }
      if (table === 'show_message_threads') {
        const query = chain({ data: [{ id: 't-1', participant_id: 'u-ann' }] });
        query.upsert.mockImplementation(rows => {
          threadUpserts.push(rows as unknown[]);
          return query;
        });
        return query;
      }
      if (table === 'show_messages') {
        const query = chain({ data: [{ id: 'msg-1' }] });
        query.insert.mockImplementation(rows => {
          messageInserts.push(rows as unknown[]);
          return query;
        });
        return query;
      }
      if (table === 'email_log') return chain({});
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
  return { supabase, threadUpserts, messageInserts, entryFilters };
}

const noPush = vi.fn(async () => ({ attempted: 0, sent: 0, suppressed: 0, failed: 0, dead: 0 }));

function emailSenderStub() {
  return vi.fn(async (args: { recipients: Array<{ email: string }> }) => ({
    sent: args.recipients.length,
    failed: 0,
    logRows: args.recipients.map(r => ({
      recipient_email: r.email,
      email_type: 'show_message',
      related_id: 'msg-1',
      resend_message_id: 'r-1',
      status: 'sent' as const,
      error_message: null,
      show_id: 'show-1',
    })),
  }));
}

function handlerWith(sender = emailSenderStub()) {
  return {
    sender,
    handler: createSendTargetedMessageHandler({
      sendPasscodePushes: noPush,
      sendShowMessageEmails: sender,
    }),
  };
}

describe('send-targeted-message person scope', () => {
  it('emails exactly the one person, once, even across several entries', async () => {
    const { supabase, threadUpserts, messageInserts } = makeSupabase();
    const { handler, sender } = handlerWith();

    const result = await handler({
      body: {
        show_id: 'show-1',
        target_type: 'person',
        person_id: 'p-ann',
        body: 'Please bring your vet papers',
        send_email: true,
      },
      user: { id: 'sender-1' },
      supabase,
    });

    expect(sender).toHaveBeenCalledTimes(1);
    expect(sender).toHaveBeenCalledWith({
      showId: 'show-1',
      showName: 'Fall Trial',
      body: 'Please bring your vet papers',
      messageId: 'msg-1',
      recipients: [{ email: 'ann@example.com', name: 'Ann Smith' }],
    });
    // The handler and the other owner on Ann's entries are never messaged.
    expect(threadUpserts[0]).toEqual([expect.objectContaining({ participant_id: 'u-ann' })]);
    expect(threadUpserts[0]).toHaveLength(1);
    expect(messageInserts[0]).toHaveLength(1);
    expect(result).toMatchObject({
      group_label: 'Sent to you by the show secretary',
      email_recipients: 1,
      email_sent: 1,
      email_missing: [],
      people_reached: 1,
    });
  });

  it('filters the person in the database (handler or their dogs), not after a capped fetch', async () => {
    const { supabase, entryFilters } = makeSupabase();
    const { handler } = handlerWith();

    await handler({
      body: {
        show_id: 'show-1',
        target_type: 'person',
        person_id: 'p-ann',
        send_email: true,
        dry_run: true,
      },
      user: { id: 'sender-1' },
      supabase,
    });

    // Once per page: the first page and the empty continuation that ends the read.
    expect(entryFilters).toEqual([
      'handler_id.eq.p-ann,dog_id.in.(dog-1,dog-2)',
      'handler_id.eq.p-ann,dog_id.in.(dog-1,dog-2)',
    ]);
  });

  it('rejects a person_id that is not a plain id before it reaches a filter string', async () => {
    const { supabase, entryFilters } = makeSupabase();
    const { handler } = handlerWith();

    await expect(
      handler({
        body: {
          show_id: 'show-1',
          target_type: 'person',
          person_id: 'x),handler_id.neq.(y',
          body: 'Hi',
        },
        user: { id: 'sender-1' },
        supabase,
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(entryFilters).toHaveLength(0);
  });

  it('works for a person who is only the handler, and names them when they have no address', async () => {
    const { supabase } = makeSupabase();
    const { handler, sender } = handlerWith();

    const result = await handler({
      body: {
        show_id: 'show-1',
        target_type: 'person',
        person_id: 'p-bob',
        body: 'Hi',
        send_email: true,
        email_only: true,
      },
      user: { id: 'sender-1' },
      supabase,
    });

    expect(sender).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      inbox_sent: 0,
      email_recipients: 0,
      email_missing: ['Bob Smith'],
    });
  });

  it('dry run previews the one recipient without sending anything', async () => {
    const { supabase, messageInserts } = makeSupabase();
    const { handler, sender } = handlerWith();

    const result = await handler({
      body: {
        show_id: 'show-1',
        target_type: 'person',
        person_id: 'p-cy',
        send_email: true,
        dry_run: true,
      },
      user: { id: 'sender-1' },
      supabase,
    });

    expect(result).toMatchObject({
      dry_run: true,
      email_recipients: 1,
      email_missing: [],
    });
    expect(sender).not.toHaveBeenCalled();
    expect(messageInserts).toHaveLength(0);
  });

  it('404s a person with no live entry in this show, without naming anyone', async () => {
    const { supabase } = makeSupabase();
    const { handler, sender } = handlerWith();

    await expect(
      handler({
        body: {
          show_id: 'show-1',
          target_type: 'person',
          person_id: 'p-stranger',
          body: 'Hi',
          send_email: true,
        },
        user: { id: 'sender-1' },
        supabase,
      })
    ).rejects.toMatchObject({ status: 404, message: 'Exhibitor not found in this show' });
    expect(sender).not.toHaveBeenCalled();
  });

  it('400s a person scope with no person_id', async () => {
    const { supabase } = makeSupabase();
    const { handler } = handlerWith();

    await expect(
      handler({
        body: { show_id: 'show-1', target_type: 'person', body: 'Hi', send_email: true },
        user: { id: 'sender-1' },
        supabase,
      })
    ).rejects.toMatchObject({ status: 400 });
  });
});
