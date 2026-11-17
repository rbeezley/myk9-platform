import { describe, expect, it, vi } from 'vitest';

import { recordEmailLog, type EmailAttempt } from './emailLog.ts';

const CONTEXT = {
  emailType: 'trial_packet' as const,
  showId: 'dededede-0000-0000-0000-000000000010',
  relatedId: '4038732d-db5d-4adf-98fd-3f15a56da264',
};

function makeStub(insert: (rows: unknown) => unknown = () => ({ error: null })) {
  const calls: unknown[] = [];
  const supabase = {
    from: (table: string) => {
      if (table !== 'email_log') throw new Error(`unexpected table ${table}`);
      return {
        insert: (rows: unknown) => {
          calls.push(rows);
          return Promise.resolve(insert(rows));
        },
      };
    },
  } as never;
  return { supabase, calls };
}

describe('recordEmailLog', () => {
  it('writes one row per recipient, keyed to that recipient own message id', async () => {
    const attempts: EmailAttempt[] = [
      { recipient: 'secretary@example.com', messageId: 'msg-1', error: null },
      { recipient: 'chair@example.com', messageId: 'msg-2', error: null },
    ];
    const { supabase, calls } = makeStub();

    await recordEmailLog(supabase, attempts, CONTEXT);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([
      {
        recipient_email: 'secretary@example.com',
        email_type: 'trial_packet',
        related_id: CONTEXT.relatedId,
        show_id: CONTEXT.showId,
        resend_message_id: 'msg-1',
        status: 'sent',
        error_message: null,
      },
      {
        recipient_email: 'chair@example.com',
        email_type: 'trial_packet',
        related_id: CONTEXT.relatedId,
        show_id: CONTEXT.showId,
        resend_message_id: 'msg-2',
        status: 'sent',
        error_message: null,
      },
    ]);
  });

  it('distinguishes message ids so resend-webhook can match exactly one row', async () => {
    // The whole reason the send is per recipient: `resend-webhook` looks up
    // its row with .maybeSingle() on resend_message_id, which ERRORS on
    // duplicates. Two rows sharing an id would silently stop delivery events
    // being recorded for that message.
    const { supabase, calls } = makeStub();

    await recordEmailLog(
      supabase,
      [
        { recipient: 'a@example.com', messageId: 'msg-1', error: null },
        { recipient: 'b@example.com', messageId: 'msg-2', error: null },
      ],
      CONTEXT
    );

    const ids = (calls[0] as Array<{ resend_message_id: string }>).map(r => r.resend_message_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('records a failed recipient as failed rather than omitting it', async () => {
    const { supabase, calls } = makeStub();

    await recordEmailLog(
      supabase,
      [
        { recipient: 'good@example.com', messageId: 'msg-1', error: null },
        { recipient: 'bad@example.com', messageId: null, error: 'provider_http_422' },
      ],
      CONTEXT
    );

    expect(calls[0]).toMatchObject([
      { recipient_email: 'good@example.com', status: 'sent' },
      { recipient_email: 'bad@example.com', status: 'failed', error_message: 'provider_http_422' },
    ]);
  });

  it('swallows a PostgREST error — the mail has already gone', async () => {
    // Bookkeeping runs AFTER the send. If it threw, the caller would treat a
    // delivered email as a failure, release its claim and send again.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { supabase } = makeStub(() => ({ error: { message: 'permission denied' } }));

    await expect(
      recordEmailLog(
        supabase,
        [{ recipient: 'a@example.com', messageId: 'm', error: null }],
        CONTEXT
      )
    ).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('swallows a thrown rejection too, not just a returned error', async () => {
    // The returned-error path and the thrown path are different code paths;
    // an early version handled only the first and a stub client that lacked
    // the table took the whole delivery down with it.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const supabase = {
      from: () => {
        throw new TypeError('no such table in this client');
      },
    } as never;

    await expect(
      recordEmailLog(
        supabase,
        [{ recipient: 'a@example.com', messageId: 'm', error: null }],
        CONTEXT
      )
    ).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('does not touch the database when there is nothing to record', async () => {
    const { supabase, calls } = makeStub();

    await recordEmailLog(supabase, [], CONTEXT);

    expect(calls).toHaveLength(0);
  });
});
