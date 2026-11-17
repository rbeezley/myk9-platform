// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { insertEmailLogOnce } from './emailLogOnce';

interface Row {
  id: string;
  resend_message_id: string | null;
  status: string;
}

/** A tiny email_log: select by message id, insert returning the new id. */
function fakeClient(rows: Row[]) {
  return {
    from: (table: string) => {
      if (table !== 'email_log') throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: (_column: string, value: string) => ({
            limit: async () => ({
              data: rows.filter(row => row.resend_message_id === value).map(({ id }) => ({ id })),
              error: null,
            }),
          }),
        }),
        insert: (row: Omit<Row, 'id'>) => ({
          select: () => ({
            single: async () => {
              const created = { ...row, id: `log-${rows.length + 1}` };
              rows.push(created);
              return { data: { id: created.id }, error: null };
            },
          }),
        }),
      };
    },
  };
}

describe('insertEmailLogOnce (MYK9-2088)', () => {
  it('records a provider message once, keeping the first row and its delivery status', async () => {
    const rows: Row[] = [];
    const client = fakeClient(rows);
    const row = { resend_message_id: 'msg-1', status: 'sent' };

    const first = await insertEmailLogOnce(client, row, '2026-11-20T15:00:00Z');
    rows[0]!.status = 'delivered';
    const again = await insertEmailLogOnce(client, row, '2026-11-20T16:00:00Z');

    expect(first).toEqual({ id: 'log-1', existing: false, error: null });
    expect(again).toEqual({ id: 'log-1', existing: true, error: null });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'log-1', resend_message_id: 'msg-1', status: 'delivered' });
  });

  it('always inserts a failure, which has no message id', async () => {
    const rows: Row[] = [];
    const client = fakeClient(rows);
    const row = { resend_message_id: null, status: 'failed' };
    await insertEmailLogOnce(client, row, 'now');
    await insertEmailLogOnce(client, row, 'now');
    expect(rows).toHaveLength(2);
  });
});
