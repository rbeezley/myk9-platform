// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createSendTargetedMessageHandler } from './targeted-message-handler';
import {
  cappedEntriesTable,
  entry,
  pad,
  person,
  simpleChain,
  type EntryRow,
  type SettledResult,
} from './capped-entries.testUtils';

const SENDER = person('p-sender', 'sender@example.com', 'sender-1');
const DUP = person('p-dup', 'dup@example.com');
const LATE = person('p-late', 'late@example.com');
const LATE_ACCOUNT = person('p-late-acct', 'late-acct@example.com', 'u-late-acct');
const NO_EMAIL = person('p-noemail', null);

/**
 * 1205 matching entries, inserted out of id order, with non-matching rows
 * (another show, soft-deleted) interleaved. Row 5 and row 1100 share a contact; the
 * only email-only person past row 1000 is LATE; the last row's owner has no email;
 * the sender handles one entry past the boundary.
 */
function allShowRows(count = 1205): EntryRow[] {
  const rows: EntryRow[] = [];
  for (let i = 1; i <= count; i++) {
    let row = entry(i);
    if (i === 5 || i === 1100)
      row = entry(i, { dog: { owner: DUP, co_owner: null }, handler: DUP, handler_id: DUP.id });
    if (i === 1120)
      row = entry(i, { dog: { owner: LATE_ACCOUNT, co_owner: null }, handler: LATE_ACCOUNT });
    if (i === 1150) row = entry(i, { dog: { owner: LATE, co_owner: null }, handler: LATE });
    if (i === 1180) row = entry(i, { handler: SENDER, handler_id: SENDER.id });
    if (i === count)
      row = entry(i, { dog: { owner: NO_EMAIL, co_owner: null }, handler: NO_EMAIL });
    rows.push(row);
    // Their own people, so a dropped show/soft-delete filter changes the counts.
    if (i % 97 === 0) rows.push(entry(`${pad(i)}-x`, { show_id: 'show-2' }));
    if (i % 89 === 0) rows.push(entry(`${pad(i)}-d`, { deleted_at: '2026-11-01T00:00:00Z' }));
  }
  // Physical order is not id order: a request with no ORDER BY returns this order.
  return rows.reverse();
}

function makeSupabase(table: ReturnType<typeof cappedEntriesTable>, dogIds: string[] = []) {
  const writes: string[] = [];
  const threadUpserts: Array<Array<{ participant_id: string }>> = [];
  const supabase = {
    from: vi.fn((name: string) => {
      if (name === 'entries') return table.query();
      if (name === 'shows')
        return simpleChain({ data: { id: 'show-1', club_id: 'c', name: 'Fall Trial' } });
      if (name === 'user_roles')
        return simpleChain({ data: [{ club_id: 'c', roles: { name: 'secretary' } }] });
      if (name === 'classes')
        return simpleChain({ data: { id: 'class-1', class_number: 4, name: 'Novice' } });
      if (name === 'dogs') return simpleChain({ data: dogIds.map(id => ({ id })) });
      if (name === 'show_message_threads') {
        const builder = simpleChain({ data: [] });
        builder.upsert.mockImplementation((rows: unknown) => {
          writes.push(name);
          const upserts = rows as Array<{ participant_id: string }>;
          threadUpserts.push(upserts);
          builder.then = ((resolve?: (value: SettledResult) => unknown) =>
            Promise.resolve({
              data: upserts.map(row => ({
                id: `t-${row.participant_id}`,
                participant_id: row.participant_id,
              })),
              error: null,
            }).then(resolve)) as typeof builder.then;
          return builder;
        });
        return builder;
      }
      if (name === 'show_messages') {
        const builder = simpleChain({ data: [{ id: 'msg-1' }] });
        builder.insert.mockImplementation(() => {
          writes.push(name);
          return builder;
        });
        return builder;
      }
      if (name === 'email_log') {
        writes.push(name);
        return simpleChain({});
      }
      throw new Error(`Unexpected table: ${name}`);
    }),
  };
  return { supabase, writes, threadUpserts };
}

function emailSenderStub() {
  return vi.fn(async (args: { recipients: Array<{ email: string; name: string }> }) => ({
    sent: args.recipients.length,
    failed: 0,
    logRows: args.recipients.map(recipient => ({
      recipient_email: recipient.email,
      email_type: 'show_message',
      related_id: 'msg-1',
      resend_message_id: 'r-1',
      status: 'sent' as const,
      error_message: null,
      show_id: 'show-1',
    })),
  }));
}

function handlerWith() {
  const sender = emailSenderStub();
  const pushes = vi.fn(async () => ({ attempted: 0, sent: 0, suppressed: 0, failed: 0, dead: 0 }));
  const handler = createSendTargetedMessageHandler({
    sendPasscodePushes: pushes,
    sendShowMessageEmails: sender,
  });
  return { handler, sender, pushes };
}

const user = { id: 'sender-1' };
const emails = (sender: ReturnType<typeof emailSenderStub>) =>
  sender.mock.calls.flatMap(([args]) => args.recipients.map(recipient => recipient.email));

describe('send-targeted-message audience past the PostgREST row cap (MYK9-1692)', () => {
  it('dry run counts every matching entry and the email-only person after row 1000', async () => {
    const table = cappedEntriesTable(allShowRows());
    const { supabase, writes } = makeSupabase(table);
    const { handler, sender } = handlerWith();

    const result = await handler({
      body: { show_id: 'show-1', target_type: 'all_show', send_email: true, dry_run: true },
      user,
      supabase,
    });

    // 1205 entries, one addressed person each, except: DUP is on two of them (one email),
    // NO_EMAIL is named instead of emailed, and the sender handling #1180 is skipped while
    // that dog's owner is still emailed. 1205 - 1 - 1 = 1203.
    expect(result).toMatchObject({
      dry_run: true,
      total_recipients: 1205,
      email_recipients: 1203,
      email_missing: ['p-noemail Smith'],
    });
    expect(sender).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it('sends to the final-page address through the injected sender, deduped across pages, without the sender', async () => {
    const table = cappedEntriesTable(allShowRows());
    const { supabase, threadUpserts } = makeSupabase(table);
    const { handler, sender } = handlerWith();

    const result = await handler({
      body: {
        show_id: 'show-1',
        target_type: 'all_show',
        body: 'Ring 2 is delayed',
        send_email: true,
      },
      user,
      supabase,
    });

    const sent = emails(sender);
    expect(sent).toContain('late@example.com');
    expect(sent).toContain('late-acct@example.com');
    expect(sent).toContain('o-00001@example.com');
    expect(sent.filter(email => email === 'dup@example.com')).toHaveLength(1);
    expect(sent).not.toContain('sender@example.com');
    expect(new Set(sent).size).toBe(sent.length);
    expect(sent).toHaveLength(1203);
    // The late account holder gets an inbox thread too; the sender never does.
    const participants = threadUpserts.flat().map(row => row.participant_id);
    expect(participants).toEqual(['u-late-acct']);
    expect(result).toMatchObject({
      email_recipients: 1203,
      email_sent: 1203,
      email_missing: ['p-noemail Smith'],
    });
  });

  it('aborts with nothing written or sent when a later page fails', async () => {
    const table = cappedEntriesTable(allShowRows(), { failOnRequest: 2 });
    const { supabase, writes } = makeSupabase(table);
    const { handler, sender, pushes } = handlerWith();

    await expect(
      handler({
        body: { show_id: 'show-1', target_type: 'all_show', body: 'Hi', send_email: true },
        user,
        supabase,
      })
    ).rejects.toMatchObject({ status: 500, message: 'Failed to resolve message recipients' });
    expect(sender).not.toHaveBeenCalled();
    expect(pushes).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it('keeps the class filter on every page', async () => {
    const rows = allShowRows(2400).map((row, index) =>
      index % 3 === 0 ? { ...row, class_id: 'class-2' } : row
    );
    const expected = rows.filter(
      row => row.show_id === 'show-1' && !row.deleted_at && row.class_id === 'class-1'
    );
    expect(expected.length).toBeGreaterThan(1000);
    const table = cappedEntriesTable(rows);
    const { supabase } = makeSupabase(table);
    const { handler } = handlerWith();

    const result = await handler({
      body: {
        show_id: 'show-1',
        class_id: 'class-1',
        target_type: 'class',
        send_email: true,
        dry_run: true,
      },
      user,
      supabase,
    });

    expect(result).toMatchObject({ total_recipients: expected.length });
  });

  it('keeps the checked-in filter on every page', async () => {
    const rows = allShowRows(2400).map((row, index) =>
      index % 4 === 0
        ? { ...row, check_in_status: 'not-checked-in' }
        : index % 4 === 1
          ? { ...row, check_in_status: 'in-ring' }
          : row
    );
    const expected = rows.filter(
      row =>
        row.show_id === 'show-1' &&
        !row.deleted_at &&
        ['checked-in', 'at-gate', 'come-to-gate', 'in-ring'].includes(row.check_in_status)
    );
    expect(expected.length).toBeGreaterThan(1000);
    const table = cappedEntriesTable(rows);
    const { supabase } = makeSupabase(table);
    const { handler } = handlerWith();

    const result = await handler({
      body: { show_id: 'show-1', target_type: 'checked_in', send_email: true, dry_run: true },
      user,
      supabase,
    });

    expect(result).toMatchObject({ total_recipients: expected.length });
  });

  it('keeps the person filter and isolation on every page', async () => {
    // HANDLER handles 1100 entries; each entry's owner is someone else who must not be emailed.
    const HANDLER = person('p-handler', 'handler@example.com');
    const rows = allShowRows(1300).map((row, index) =>
      index < 1100 ? { ...row, handler: HANDLER, handler_id: HANDLER.id } : row
    );
    const expected = rows.filter(
      row => row.show_id === 'show-1' && !row.deleted_at && row.handler_id === HANDLER.id
    );
    expect(expected.length).toBeGreaterThan(1000);
    const table = cappedEntriesTable(rows);
    const { supabase } = makeSupabase(table);
    const { handler, sender } = handlerWith();

    const preview = await handler({
      body: {
        show_id: 'show-1',
        target_type: 'person',
        person_id: HANDLER.id,
        send_email: true,
        dry_run: true,
      },
      user,
      supabase,
    });
    expect(preview).toMatchObject({
      total_recipients: expected.length,
      email_recipients: 1,
      email_missing: [],
    });

    await handler({
      body: {
        show_id: 'show-1',
        target_type: 'person',
        person_id: HANDLER.id,
        body: 'Hi',
        send_email: true,
      },
      user,
      supabase,
    });
    expect(emails(sender)).toEqual(['handler@example.com']);
    // Every page of both calls carries the person filter.
    expect(table.orFilters).toHaveLength(table.requests.length);
    expect(new Set(table.orFilters)).toEqual(new Set(['handler_id.eq.p-handler']));
  });

  it('terminates on an exact multiple of the page size with every entry', async () => {
    const rows = Array.from({ length: 2000 }, (_, i) => entry(i + 1)).reverse();
    const table = cappedEntriesTable(rows);
    const { supabase } = makeSupabase(table);
    const { handler } = handlerWith();

    const result = await handler({
      body: { show_id: 'show-1', target_type: 'all_show', send_email: true, dry_run: true },
      user,
      supabase,
    });

    expect(result).toMatchObject({ total_recipients: 2000, email_recipients: 2000 });
    expect(table.requests.every(request => request.order === 'id')).toBe(true);
    // Two full pages, then the empty page that ends the read.
    expect(table.requests.map(request => request.returned)).toEqual([1000, 1000, 0]);
  });

  it('still reads every entry when the server cap is below the page size', async () => {
    const table = cappedEntriesTable(allShowRows(), { maxRows: 300 });
    const { supabase } = makeSupabase(table);
    const { handler } = handlerWith();

    const result = await handler({
      body: { show_id: 'show-1', target_type: 'all_show', send_email: true, dry_run: true },
      user,
      supabase,
    });

    expect(result).toMatchObject({ total_recipients: 1205, email_recipients: 1203 });
  });
});
