// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import { logReceiptEmail } from './receiptEmailLog.ts';

function makeClient(opts: { contentError?: unknown; logId?: string | null } = {}) {
  const contentInsert = vi.fn(() => Promise.resolve({ error: opts.contentError ?? null }));
  const logInsert = vi.fn(() => ({
    select: () => ({
      single: () =>
        Promise.resolve({
          data: opts.logId === null ? null : { id: opts.logId ?? 'log-1' },
          error: null,
        }),
    }),
  }));
  const from = vi.fn((table: string) =>
    table === 'email_log' ? { insert: logInsert } : { insert: contentInsert }
  );
  return { client: { from } as never, from, logInsert, contentInsert };
}

const row = { email_type: 'registration_confirmation', status: 'sent', show_id: 's1' };
const content = { subject: 'Entry received - Fall Trial', html: '<p>Receipt</p>' };

describe('logReceiptEmail', () => {
  it('stores the receipt subject and html against the new email_log id', async () => {
    const { client, from, logInsert, contentInsert } = makeClient();
    await logReceiptEmail(client, row, content);
    expect(logInsert).toHaveBeenCalledWith(row);
    expect(from).toHaveBeenCalledWith('email_log_contents');
    expect(contentInsert).toHaveBeenCalledWith([
      { email_log_id: 'log-1', subject: content.subject, html: content.html },
    ]);
  });

  it('stores nothing when there is no rendered content', async () => {
    const { client, contentInsert } = makeClient();
    await logReceiptEmail(client, row, null);
    expect(contentInsert).not.toHaveBeenCalled();
  });

  it('does not throw when the content store fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client } = makeClient({ contentError: { message: 'boom' } });
    await expect(logReceiptEmail(client, row, content)).resolves.toBeUndefined();
    spy.mockRestore();
  });

  it('does not throw when the log insert rejects', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = {
      from: () => ({
        insert: () => {
          throw new Error('down');
        },
      }),
    } as never;
    await expect(logReceiptEmail(client, row, content)).resolves.toBeUndefined();
    spy.mockRestore();
  });
});

describe('emailLogContent copies', () => {
  it('the webhook tree copy is byte-identical to supabase/functions/_shared', () => {
    const mine = readFileSync(new URL('../_shared/emailLogContent.ts', import.meta.url), 'utf8');
    const root = readFileSync(
      new URL('../../../../../supabase/functions/_shared/emailLogContent.ts', import.meta.url),
      'utf8'
    );
    expect(mine).toBe(root);
  });
});
