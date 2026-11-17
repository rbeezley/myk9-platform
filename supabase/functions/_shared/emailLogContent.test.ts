import { describe, expect, it, vi } from 'vitest';

import { MAX_STORED_EMAIL_HTML_CHARS, storeEmailContent, storeEmailContents } from './emailLogContent.ts';

function makeClient(result: { error: unknown } | Error) {
  const insert = vi.fn(() =>
    result instanceof Error ? Promise.reject(result) : Promise.resolve(result)
  );
  const from = vi.fn(() => ({ insert }));
  return { client: { from }, from, insert };
}

describe('storeEmailContent', () => {
  it('stores the subject and html against the email_log id', async () => {
    const { client, from, insert } = makeClient({ error: null });
    await storeEmailContent(client, 'log-1', 'Hello', '<p>Hi</p>');
    expect(from).toHaveBeenCalledWith('email_log_contents');
    expect(insert).toHaveBeenCalledWith([
      { email_log_id: 'log-1', subject: 'Hello', html: '<p>Hi</p>' },
    ]);
  });

  it('does nothing without an email_log id', async () => {
    const { client, from } = makeClient({ error: null });
    await storeEmailContent(client, undefined, 'Hello', '<p>Hi</p>');
    expect(from).not.toHaveBeenCalled();
  });

  it('cuts very large html', async () => {
    const { client, insert } = makeClient({ error: null });
    await storeEmailContent(client, 'log-1', 'Big', 'x'.repeat(MAX_STORED_EMAIL_HTML_CHARS + 10));
    const stored = (insert.mock.calls[0] as unknown as [{ html: string }[]])[0][0]!.html;
    expect(stored.startsWith('x'.repeat(MAX_STORED_EMAIL_HTML_CHARS))).toBe(true);
    expect(stored.length).toBeLessThan(MAX_STORED_EMAIL_HTML_CHARS + 200);
  });

  it('never throws on a returned error or a rejection', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(
      storeEmailContent(makeClient({ error: { code: '42501' } }).client, 'l', 's', 'h')
    ).resolves.toBeUndefined();
    await expect(
      storeEmailContent(makeClient(new Error('boom')).client, 'l', 's', 'h')
    ).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it('stores a batch in one insert and skips items without an id', async () => {
    const { client, insert } = makeClient({ error: null });
    await storeEmailContents(client, [
      { emailLogId: 'a', subject: 'S', html: 'h1' },
      { emailLogId: null, subject: 'S', html: 'h2' },
      { emailLogId: 'b', subject: 'S', html: 'h3' },
    ]);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith([
      { email_log_id: 'a', subject: 'S', html: 'h1' },
      { email_log_id: 'b', subject: 'S', html: 'h3' },
    ]);
  });
});
