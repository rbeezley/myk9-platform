// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createShowMessageEmailSender } from './emailDelivery';
import { createSendTargetedMessageHandler } from './targeted-message-handler';
import { resolveEmailAudience, type EntryRecipientSource } from './targeting';

type SettledResult = { data: unknown; error: unknown };

function chain(result: { data?: unknown; error?: unknown }) {
  const settled: SettledResult = { data: result.data ?? null, error: result.error ?? null };
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    is: vi.fn(() => query),
    or: vi.fn(() => query),
    in: vi.fn(() => query),
    upsert: vi.fn(() => query),
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

const ENTRIES = [
  {
    armband: '101',
    dog: { owner: person('p1', 'Ann', 'ann@example.com', 'u1'), co_owner: null },
    handler: person('p2', 'Bob', null, 'u2'),
  },
  {
    // Ann again on a second dog: must not get a second email.
    armband: '102',
    dog: { owner: person('p1', 'Ann', 'ann@example.com', 'u1'), co_owner: null },
    handler: person('sender-person', 'Sam', 'sam@example.com', 'sender-1'),
  },
];

function makeSupabase(entries: unknown[] = ENTRIES) {
  const insertedEmailLog: unknown[][] = [];
  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'shows')
        return chain({ data: { id: 'show-1', club_id: 'c', name: 'Fall Trial' } });
      if (table === 'user_roles') {
        return chain({ data: [{ club_id: 'c', roles: { name: 'secretary' } }] });
      }
      if (table === 'entries') return chain({ data: entries });
      if (table === 'show_message_threads') {
        return chain({
          data: [
            { id: 't1', participant_id: 'u1' },
            { id: 't2', participant_id: 'u2' },
          ],
        });
      }
      if (table === 'show_messages') return chain({ data: [{ id: 'msg-1' }] });
      if (table === 'email_log') {
        const query = chain({});
        query.insert.mockImplementation(rows => {
          insertedEmailLog.push(rows as unknown[]);
          return query;
        });
        return query;
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
  return { supabase, insertedEmailLog };
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

describe('resolveEmailAudience', () => {
  const source = (ENTRIES as unknown as Array<Record<string, unknown>>).map(entry => ({
    armband: null,
    authUserIds: [],
    contacts: [
      (entry.dog as { owner: Record<string, unknown> }).owner,
      entry.handler as Record<string, unknown>,
    ].map(p => ({
      personId: p.id as string,
      authUserId: p.auth_user_id as string,
      name: `${p.first_name} ${p.last_name}`,
      email: p.email as string | null,
    })),
  })) satisfies EntryRecipientSource[];

  it('names people whose address is malformed instead of sending to it', () => {
    const audience = resolveEmailAudience(
      [
        {
          armband: null,
          authUserIds: [],
          contacts: [
            { personId: 'p1', authUserId: null, name: 'Typo', email: 'n/a' },
            { personId: 'p2', authUserId: null, name: 'Space', email: 'a b@example.com' },
            { personId: 'p3', authUserId: null, name: 'NoDot', email: 'a@localhost' },
            { personId: 'p4', authUserId: null, name: 'Good', email: 'good@example.com' },
          ],
        },
      ],
      'sender-1'
    );
    expect(audience.recipients).toEqual([{ email: 'good@example.com', name: 'Good' }]);
    expect(audience.missing).toEqual(['Typo', 'Space', 'NoDot']);
  });

  it('dedupes people, names people with no address, and skips the sender', () => {
    expect(resolveEmailAudience(source, 'sender-1')).toEqual({
      recipients: [{ email: 'ann@example.com', name: 'Ann Smith' }],
      missing: ['Bob Smith'],
    });
  });
});

describe('send-targeted-message email delivery', () => {
  it('emails the server-resolved audience and logs it with the message id', async () => {
    const { supabase, insertedEmailLog } = makeSupabase();
    const sendShowMessageEmails = emailSenderStub();
    const handler = createSendTargetedMessageHandler({
      sendPasscodePushes: noPush,
      sendShowMessageEmails,
    });

    const result = await handler({
      body: { show_id: 'show-1', target_type: 'all_show', body: 'Venue changed', send_email: true },
      user: { id: 'sender-1' },
      supabase,
    });

    expect(sendShowMessageEmails).toHaveBeenCalledWith({
      showId: 'show-1',
      showName: 'Fall Trial',
      body: 'Venue changed',
      messageId: 'msg-1',
      recipients: [{ email: 'ann@example.com', name: 'Ann Smith' }],
    });
    expect(insertedEmailLog[0]).toEqual([
      expect.objectContaining({ email_type: 'show_message', show_id: 'show-1' }),
    ]);
    expect(result).toMatchObject({
      email_recipients: 1,
      email_sent: 1,
      email_failed: 0,
      email_missing: ['Bob Smith'],
    });
  });

  it('counts unlinked exhibitors reached only by email, so the audience is not reported empty', async () => {
    const { supabase } = makeSupabase([
      {
        armband: '201',
        dog: { owner: person('p9', 'Una', 'una@example.com', null), co_owner: null },
        handler: person('p9', 'Una', 'una@example.com', null),
      },
    ]);
    const handler = createSendTargetedMessageHandler({
      sendPasscodePushes: noPush,
      sendShowMessageEmails: emailSenderStub(),
    });

    const result = await handler({
      body: { show_id: 'show-1', target_type: 'all_show', body: 'Hi', send_email: true },
      user: { id: 'sender-1' },
      supabase,
    });

    expect(result).toMatchObject({ total_recipients: 1, email_recipients: 1, email_sent: 1 });
  });

  it('does not email when the option is off', async () => {
    const { supabase } = makeSupabase();
    const sendShowMessageEmails = emailSenderStub();
    const handler = createSendTargetedMessageHandler({
      sendPasscodePushes: noPush,
      sendShowMessageEmails,
    });

    const result = await handler({
      body: { show_id: 'show-1', target_type: 'all_show', body: 'Hi' },
      user: { id: 'sender-1' },
      supabase,
    });

    expect(sendShowMessageEmails).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty('email_recipients');
  });

  it('dry run counts the audience and writes nothing', async () => {
    const { supabase } = makeSupabase();
    const sendShowMessageEmails = emailSenderStub();
    const handler = createSendTargetedMessageHandler({
      sendPasscodePushes: noPush,
      sendShowMessageEmails,
    });

    const result = await handler({
      body: {
        show_id: 'show-1',
        target_type: 'all_show',
        body: 'x',
        send_email: true,
        dry_run: true,
      },
      user: { id: 'sender-1' },
      supabase,
    });

    expect(result).toMatchObject({
      dry_run: true,
      email_recipients: 1,
      email_missing: ['Bob Smith'],
    });
    expect(sendShowMessageEmails).not.toHaveBeenCalled();
    expect(supabase.from).not.toHaveBeenCalledWith('show_messages');
  });

  it('email_only skips inbox threads and push', async () => {
    const { supabase } = makeSupabase();
    const handler = createSendTargetedMessageHandler({
      sendPasscodePushes: noPush,
      sendShowMessageEmails: emailSenderStub(),
    });

    await handler({
      body: {
        show_id: 'show-1',
        target_type: 'all_show',
        body: 'x',
        email_only: true,
      },
      user: { id: 'sender-1' },
      supabase,
    });

    expect(supabase.from).not.toHaveBeenCalledWith('show_message_threads');
    expect(noPush).not.toHaveBeenCalledWith(
      expect.objectContaining({ targets: expect.anything() })
    );
  });
});

describe('createShowMessageEmailSender', () => {
  const args = {
    showId: 'show-1',
    showName: 'Fall <Trial>',
    body: 'Venue changed',
    messageId: 'msg-1',
    recipients: [
      { email: 'a@example.com', name: 'A' },
      { email: 'b@example.com', name: 'B' },
    ],
  };

  const batchOk = (n: number, prefix: string) =>
    new Response(
      JSON.stringify({ data: Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${i}` })) }),
      { status: 200 }
    );

  it('posts one escaped batch and maps returned ids to recipients', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(batchOk(2, 'resend'));
    const sender = createShowMessageEmailSender({ apiKey: 'key', fetchImpl });

    const result = await sender(args);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.resend.com/emails/batch');
    const payload = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(payload).toHaveLength(2);
    expect(payload[0].to).toBe('a@example.com');
    expect(payload[0].html).toContain('Fall &lt;Trial&gt;');
    expect(result.sent).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.logRows).toEqual([
      expect.objectContaining({
        recipient_email: 'a@example.com',
        status: 'sent',
        resend_message_id: 'resend-0',
        show_id: 'show-1',
        related_id: 'msg-1',
      }),
      expect.objectContaining({
        recipient_email: 'b@example.com',
        status: 'sent',
        resend_message_id: 'resend-1',
      }),
    ]);
  });

  it('splits 250 recipients into sequential batches of at most 100', async () => {
    const recipients = Array.from({ length: 250 }, (_, i) => ({
      email: `p${i}@example.com`,
      name: `P${i}`,
    }));
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchImpl = vi.fn(async (_url: string, init: { body: string }) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight--;
      const size = JSON.parse(init.body).length;
      return batchOk(size, `id${fetchImpl.mock.calls.length}`);
    });
    const sender = createShowMessageEmailSender({
      apiKey: 'key',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await sender({ ...args, recipients });

    expect(fetchImpl.mock.calls.map(c => JSON.parse(c[1].body).length)).toEqual([100, 100, 50]);
    expect(maxInFlight).toBe(1);
    expect(result.sent).toBe(250);
    expect(result.logRows).toHaveLength(250);
    expect(result.logRows[0]).toEqual(
      expect.objectContaining({ recipient_email: 'p0@example.com', resend_message_id: 'id1-0' })
    );
    expect(result.logRows[100]).toEqual(
      expect.objectContaining({ recipient_email: 'p100@example.com', resend_message_id: 'id2-0' })
    );
    expect(result.logRows[249]).toEqual(
      expect.objectContaining({ recipient_email: 'p249@example.com', resend_message_id: 'id3-49' })
    );
  });

  it('retries a rejected batch one recipient at a time so one bad address cannot sink the rest', async () => {
    const recipients = [
      { email: 'a@example.com', name: 'A' },
      { email: 'bad@example.com', name: 'Bad' },
      { email: 'c@example.com', name: 'C' },
    ];
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('bad', { status: 422 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'one-a' }), { status: 200 }))
      .mockResolvedValueOnce(new Response('bad', { status: 422 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'one-c' }), { status: 200 }));
    const result = await createShowMessageEmailSender({ apiKey: 'key', fetchImpl })({
      ...args,
      recipients,
    });

    expect(fetchImpl.mock.calls.map(c => c[0])).toEqual([
      'https://api.resend.com/emails/batch',
      'https://api.resend.com/emails',
      'https://api.resend.com/emails',
      'https://api.resend.com/emails',
    ]);
    expect(JSON.parse(fetchImpl.mock.calls[2][1].body).to).toBe('bad@example.com');
    expect(result.sent).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.logRows).toEqual([
      expect.objectContaining({
        recipient_email: 'a@example.com',
        status: 'sent',
        resend_message_id: 'one-a',
      }),
      expect.objectContaining({
        recipient_email: 'bad@example.com',
        status: 'failed',
        error_message: 'provider_http_422',
      }),
      expect.objectContaining({
        recipient_email: 'c@example.com',
        status: 'sent',
        resend_message_id: 'one-c',
      }),
    ]);
  });

  it('logs each recipient of a failing batch as failed with the provider status on a 5xx', async () => {
    const recipients = Array.from({ length: 150 }, (_, i) => ({
      email: `p${i}@example.com`,
      name: `P${i}`,
    }));
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('x', { status: 500 }))
      .mockResolvedValueOnce(new Response('x', { status: 500 }))
      .mockResolvedValueOnce(new Response('x', { status: 500 }))
      .mockResolvedValueOnce(batchOk(50, 'ok'));
    const result = await createShowMessageEmailSender({ apiKey: 'key', fetchImpl })({
      ...args,
      recipients,
    });

    expect(result.failed).toBe(100);
    expect(result.sent).toBe(50);
    expect(
      result.logRows
        .slice(0, 100)
        .every(r => r.status === 'failed' && r.error_message === 'provider_http_500')
    ).toBe(true);
    expect(result.logRows.slice(100).every(r => r.status === 'sent')).toBe(true);
  });

  it('fails the batch rather than guessing when the id count does not match', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(batchOk(1, 'x'));
    const result = await createShowMessageEmailSender({ apiKey: 'key', fetchImpl })(args);
    expect(result.failed).toBe(2);
    expect(result.logRows.every(r => r.error_message === 'provider_response_mismatch')).toBe(true);
  });

  it('logs every recipient as failed when Resend is not configured', async () => {
    const result = await createShowMessageEmailSender({ apiKey: undefined })(args);
    expect(result.failed).toBe(2);
    expect(result.logRows.every(r => r.error_message === 'email_not_configured')).toBe(true);
  });
});
