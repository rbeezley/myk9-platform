// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import {
  RECEIPT_RETRY_MAX_AGE_MS,
  RECEIPT_RETRY_MIN_AGE_MS,
  RECEIPT_SWEEP_MAX_REGISTRATIONS,
  groupFailedReceipts,
  sweepFailedReceipts,
  type FailedReceiptRow,
  type ReceiptResendOutcome,
  type ReceiptSweepClient,
} from './receiptSweep';

const NOW = Date.parse('2026-11-14T12:00:00Z');

/** Records every filter the sweep applies, then resolves with the rows it is given. */
function fakeClient(rows: FailedReceiptRow[] | null, error: { message: string } | null = null) {
  const calls: Array<[string, ...unknown[]]> = [];
  const chain: Record<string, unknown> = {};
  chain.update = (...args: unknown[]) => {
    calls.push(['update', ...args]);
    return {
      in: (...inArgs: unknown[]) => (
        calls.push(['in', ...inArgs]),
        Promise.resolve({ error: null })
      ),
    };
  };
  for (const name of ['select', 'eq', 'is', 'lt', 'gt', 'order']) {
    chain[name] = (...args: unknown[]) => {
      calls.push([name, ...args]);
      return chain;
    };
  }
  chain.limit = (...args: unknown[]) => {
    calls.push(['limit', ...args]);
    return Promise.resolve({ data: rows, error });
  };
  const client = { from: () => chain } as unknown as ReceiptSweepClient;
  return { client, calls };
}

describe('sweepFailedReceipts', () => {
  it('reads only failed, unsent, live receipts inside the retry window, oldest first, bounded', async () => {
    const { client, calls } = fakeClient([]);
    await sweepFailedReceipts(client, vi.fn(), NOW);
    expect(calls).toEqual([
      ['select', 'id, registration_id'],
      ['eq', 'receipt_email_status', 'failed'],
      ['is', 'receipt_email_sent_at', null],
      ['is', 'deleted_at', null],
      ['lt', 'receipt_email_attempted_at', new Date(NOW - RECEIPT_RETRY_MIN_AGE_MS).toISOString()],
      ['gt', 'receipt_email_attempted_at', new Date(NOW - RECEIPT_RETRY_MAX_AGE_MS).toISOString()],
      ['order', 'receipt_email_attempted_at', { ascending: true }],
      ['limit', 100],
    ]);
  });

  it('is independent of any confirmation date: it never reads trials', async () => {
    const { client } = fakeClient([{ id: 'e1', registration_id: 'r1' }]);
    const from = vi.spyOn(client, 'from');
    await sweepFailedReceipts(client, async () => 'sent', NOW);
    expect(from.mock.calls.map(c => c[0])).toEqual(['entries']);
  });

  it('re-sends each registration once with exactly its failed entry ids', async () => {
    const { client } = fakeClient([
      { id: 'e1', registration_id: 'r1' },
      { id: 'e2', registration_id: 'r1' },
      { id: 'e3', registration_id: 'r2' },
    ]);
    const resend = vi.fn(async (): Promise<ReceiptResendOutcome> => 'sent');
    expect(await sweepFailedReceipts(client, resend, NOW)).toEqual({
      retried: 2,
      stillFailing: 0,
      rejected: 0,
    });
    expect(resend).toHaveBeenCalledWith('r1', ['e1', 'e2']);
    expect(resend).toHaveBeenCalledWith('r2', ['e3']);
    expect(resend).toHaveBeenCalledTimes(2);
  });

  it('one failing or throwing registration does not stop the others', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { client } = fakeClient([
      { id: 'e1', registration_id: 'r1' },
      { id: 'e2', registration_id: 'r2' },
      { id: 'e3', registration_id: 'r3' },
    ]);
    const resend = vi.fn(async (registrationId: string): Promise<ReceiptResendOutcome> => {
      if (registrationId === 'r1') throw new Error('timeout');
      return registrationId === 'r3' ? 'sent' : 'retry';
    });
    expect(await sweepFailedReceipts(client, resend, NOW)).toEqual({
      retried: 1,
      stillFailing: 2,
      rejected: 0,
    });
    log.mockRestore();
  });

  it('a registration the server refuses is recorded and moved behind the queue, not retried every run', async () => {
    const { client, calls } = fakeClient([
      { id: 'e1', registration_id: 'r1' },
      { id: 'e2', registration_id: 'r2' },
    ]);
    const resend = vi.fn(async (registrationId: string): Promise<ReceiptResendOutcome> =>
      registrationId === 'r1' ? 'rejected' : 'sent'
    );
    expect(await sweepFailedReceipts(client, resend, NOW)).toEqual({
      retried: 1,
      stillFailing: 0,
      rejected: 1,
    });
    expect(calls).toContainEqual([
      'update',
      { receipt_email_attempted_at: new Date(NOW).toISOString() },
    ]);
    expect(calls).toContainEqual(['in', 'id', ['e1']]);
    expect(calls.filter(c => c[0] === 'update')).toHaveLength(1);
  });

  it('a read error retries nothing and does not throw', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { client } = fakeClient(null, { message: 'db down' });
    const resend = vi.fn();
    expect(await sweepFailedReceipts(client, resend, NOW)).toEqual({
      retried: 0,
      stillFailing: 0,
      rejected: 0,
    });
    expect(resend).not.toHaveBeenCalled();
    log.mockRestore();
  });
});

describe('groupFailedReceipts', () => {
  it('caps registrations per run but keeps every failed entry of a registration already taken', () => {
    const rows: FailedReceiptRow[] = [];
    for (let i = 0; i < RECEIPT_SWEEP_MAX_REGISTRATIONS + 5; i++) {
      rows.push({ id: `e${i}`, registration_id: `r${i}` });
    }
    rows.push({ id: 'extra', registration_id: 'r0' });
    const groups = groupFailedReceipts(rows, RECEIPT_SWEEP_MAX_REGISTRATIONS);
    expect(groups).toHaveLength(RECEIPT_SWEEP_MAX_REGISTRATIONS);
    expect(groups[0]).toEqual({ registrationId: 'r0', entryIds: ['e0', 'extra'] });
  });

  it('skips entries with no registration', () => {
    expect(groupFailedReceipts([{ id: 'e1', registration_id: null }], 10)).toEqual([]);
  });
});
